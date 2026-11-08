// Row-level security tests, on real Postgres (PGlite) with our real migrations.
// A small stand-in provides the Supabase parts migrations rely on.
import { readdirSync, readFileSync } from 'node:fs';
import { rollExpression } from '../../src/lib/engine/notation.ts';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VOYAGE = '00000000-0000-4000-8000-000000000001';
const GM = '10000000-0000-4000-8000-000000000001'; // the existing GM
const RIVAL = '10000000-0000-4000-8000-000000000002'; // GM of another campaign
const PLAYER = '10000000-0000-4000-8000-000000000003';
const STRANGER = '10000000-0000-4000-8000-000000000004';

const db = new PGlite();

/** Run one statement as a Supabase role. Returns rows, or the error code. */
async function as(user: string | null, sql: string, params: unknown[] = []) {
	await db.exec(`begin; set local role ${user ? 'authenticated' : 'anon'};
		select set_config('test.uid', '${user ?? ''}', true);`);
	try {
		const { rows, affectedRows } = await db.query<Record<string, unknown>>(sql, params);
		await db.exec('commit');
		return { rows, affected: affectedRows ?? 0, error: null as string | null };
	} catch (e) {
		await db.exec('rollback');
		return { rows: [], affected: 0, error: (e as { code?: string }).code ?? String(e) };
	}
}

let rivalCampaign = '';
beforeAll(async () => {
	await db.exec(`
		create role anon; create role authenticated;
		create schema auth;
		grant usage on schema auth, public to anon, authenticated;
		create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
		create function auth.uid() returns uuid language sql stable as
			$$ select nullif(current_setting('test.uid', true), '')::uuid $$;
		create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
		grant execute on all functions in schema auth to anon, authenticated;
		insert into auth.users (id, email) values
			('${GM}', 'gm@example.com'), ('${RIVAL}', 'rival@example.com'),
			('${PLAYER}', 'player@example.com'), ('${STRANGER}', 'stranger@example.com');
	`);
	for (const file of readdirSync('supabase/migrations').sort()) {
		if (file.includes('_campaigns')) await db.exec(`insert into public.gms(email) values ('gm@example.com')`);
		await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
	}
	rivalCampaign = (await as(RIVAL, `select public.create_campaign('Other') as id`)).rows[0].id as string;
	await db.exec(`insert into public.campaign_members(campaign_id, user_id, role) values ('${VOYAGE}', '${PLAYER}', 'player')`);
});
afterAll(() => db.close());

function post(user: string | null, campaign = VOYAGE, author = user, hidden = false, id = crypto.randomUUID()) {
	return as(user, `insert into public.campaign_rolls
		(id, campaign_id, user_id, rolled_at, label, kind, result, hidden)
		values ($1, $2, $3, now(), 'Handgun', 'skill', '{"rolls":[7],"modifier":8,"total":15}', $4)
		returning id`, [id, campaign, author, hidden]);
}

describe('campaign dice log RLS', () => {
	it('members post and read rolls with their identity and result', async () => {
		expect((await post(PLAYER)).error).toBeNull();
		const read = await as(GM, 'select user_id, roller_name, label, result from public.campaign_rolls');
		expect(read.rows).toEqual([{ user_id: PLAYER, roller_name: 'player', label: 'Handgun', result: { rolls: [7], modifier: 8, total: 15 } }]);
	});
	it('accepts the free roller maximum of 200 dice, including long normalized expressions', async () => {
		const outcome = rollExpression(Array.from({ length: 200 }, () => 'd1000').join('+'));
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.result.rolls).toHaveLength(200);
		expect(outcome.expression.length).toBeGreaterThan(500);
		const posted = await as(PLAYER, `insert into public.campaign_rolls
			(id, campaign_id, user_id, rolled_at, label, kind, result)
			values (gen_random_uuid(), $1, $2, now(), $3, 'free', $4)`,
			[VOYAGE, PLAYER, outcome.expression, JSON.stringify(outcome.result)]);
		expect(posted.error).toBeNull();
	});
	it('public campaign rolls are private to members, even for another campaign GM', async () => {
		for (const user of [STRANGER, RIVAL]) {
			expect((await as(user, 'select * from public.campaign_rolls')).rows).toEqual([]);
			expect((await post(user)).error).toBe('42501');
		}
		expect((await as(null, 'select * from public.campaign_rolls')).error).toBe('42501');
		expect((await post(null, VOYAGE, PLAYER)).error).toBe('42501');
	});
	it('cannot impersonate another member, including as the GM', async () => {
		expect((await post(PLAYER, VOYAGE, GM)).error).toBe('42501');
		expect((await post(GM, VOYAGE, PLAYER)).error).toBe('42501');
	});
	it('does not let clients spoof the server-derived roller name', async () => {
		expect((await as(PLAYER, `insert into public.campaign_rolls (id, campaign_id, user_id, roller_name, rolled_at, label, kind, result)
			values (gen_random_uuid(), '${VOYAGE}', '${PLAYER}', 'gm', now(), 'x', 'free', '{"rolls":[1],"modifier":0,"total":1}')`)).error).toBe('42501');
	});
	it('isolates reads and posts across campaigns' , async () => {
		expect((await post(RIVAL, rivalCampaign)).error).toBeNull();
		expect((await post(PLAYER, rivalCampaign)).error).toBe('42501');
		expect((await post(GM, rivalCampaign)).error).toBe('42501');
		expect((await as(PLAYER, `select * from public.campaign_rolls where campaign_id = '${rivalCampaign}'`)).rows).toEqual([]);
		expect((await as(RIVAL, `select * from public.campaign_rolls where campaign_id = '${VOYAGE}'`)).rows).toEqual([]);
	});
	it('only the campaign GM can post and read hidden rolls', async () => {
		expect((await post(PLAYER, VOYAGE, PLAYER, true)).error).toBe('42501');
		expect((await post(RIVAL, VOYAGE, RIVAL, true)).error).toBe('42501');
		expect((await post(GM, VOYAGE, GM, true)).error).toBeNull();
		expect((await as(GM, 'select * from public.campaign_rolls where hidden')).rows).toHaveLength(1);
		for (const user of [PLAYER, RIVAL, STRANGER]) {
			expect((await as(user, 'select * from public.campaign_rolls where hidden')).rows).toEqual([]);
		}
	});
	it('cannot edit, move or delete history, or supply server ordering', async () => {
		expect((await as(PLAYER, `update public.campaign_rolls set campaign_id = '${rivalCampaign}'`)).error).toBe('42501');
		expect((await as(GM, 'delete from public.campaign_rolls')).error).toBe('42501');
		expect((await as(GM, `insert into public.campaign_rolls (id, campaign_id, user_id, rolled_at, label, kind, result, created_at)
			values (gen_random_uuid(), '${VOYAGE}', '${GM}', now(), 'x', 'free', '{"rolls":[1],"modifier":0,"total":1}', now())`)).error).toBe('42501');
	});
	it('allows idempotent offline retries with INSERT ON CONFLICT DO NOTHING', async () => {
		const id = crypto.randomUUID();
		expect((await post(PLAYER, VOYAGE, PLAYER, false, id)).error).toBeNull();
		const retry = await as(PLAYER, `insert into public.campaign_rolls
			(id, campaign_id, user_id, rolled_at, label, kind, result, hidden)
			values ('${id}', '${VOYAGE}', '${PLAYER}', now(), 'Handgun', 'skill', '{"rolls":[7],"modifier":8,"total":15}', false)
			on conflict (id) do nothing`);
		expect(retry.error).toBeNull();
		expect(retry.affected).toBe(0);
	});
	it('prunes to the newest 100 per campaign, including hidden rolls', async () => {
		const before = (await as(GM, `select max(sequence)::int as n from public.campaign_rolls where campaign_id = '${VOYAGE}'`)).rows[0].n as number;
		const insert = await as(GM, `insert into public.campaign_rolls
			(id, campaign_id, user_id, rolled_at, label, kind, result, hidden)
			select gen_random_uuid(), '${VOYAGE}', '${GM}', now(), 'roll ' || n, 'free', '{"rolls":[1],"modifier":0,"total":1}', n % 2 = 0
			from generate_series(1, 110) n`);
		expect(insert.error).toBeNull();
		const rows = await as(GM, `select label, sequence::int from public.campaign_rolls where campaign_id = '${VOYAGE}' order by sequence`);
		expect(rows.rows).toHaveLength(100);
		expect(rows.rows[0].label).toBe('roll 11');
		expect(rows.rows.every(r => (r.sequence as number) > before)).toBe(true);
		expect((await as(RIVAL, 'select * from public.campaign_rolls')).rows).toHaveLength(1);
	});
	it('membership removal revokes reads and posts', async () => {
		await as(GM, `delete from public.campaign_members where user_id = '${PLAYER}'`);
		expect((await as(PLAYER, 'select * from public.campaign_rolls')).rows).toEqual([]);
		expect((await post(PLAYER)).error).toBe('42501');
	});
});
