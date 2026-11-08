// Character privacy (#52), on real Postgres (PGlite) with our real migrations.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const GM = '10000000-0000-4000-8000-000000000001';
const PLAYER = '10000000-0000-4000-8000-000000000002';
const TEAMMATE = '10000000-0000-4000-8000-000000000003';
const RIVAL = '10000000-0000-4000-8000-000000000004';

const db = new PGlite();
let campaignId = '';

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

const sheet = (name: string) => JSON.stringify({ id: 'x', name });
const save = (user: string | null, id: string, name: string, at: number, removed: number | null = null) =>
	as(user, `select public.save_character($1, $2::jsonb, $3::bigint, $4::bigint) as stored`, [id, sheet(name), at, removed]);
const names = (r: { rows: Record<string, unknown>[] }) =>
	r.rows.map((x) => (x.data as { name: string }).name).sort();
const read = (user: string | null) => as(user, `select data from public.characters`);

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
			('${GM}', 'gm@example.com'), ('${PLAYER}', 'player@example.com'),
			('${TEAMMATE}', 'teammate@example.com'), ('${RIVAL}', 'rival@example.com');
	`);
	const dir = 'supabase/migrations';
	for (const file of readdirSync(dir).sort()) {
		if (file.includes('_campaigns')) await db.exec(`insert into public.gms (email) values ('gm@example.com');`);
		await db.exec(readFileSync(`${dir}/${file}`, 'utf8'));
	}
	campaignId = (await as(GM, `select public.create_campaign('Table') as id`)).rows[0].id as string;
	const code = (await as(GM, `select code from public.campaign_invites where campaign_id = '${campaignId}'`)).rows[0].code;
	await as(PLAYER, `select public.join_campaign('${code}')`);
	await as(TEAMMATE, `select public.join_campaign('${code}')`);
	await as(RIVAL, `select public.create_campaign('Rival')`);

	await save(PLAYER, 'p1', 'Player One', 1000);
	await save(TEAMMATE, 't1', 'Teammate One', 1000);
	await db.exec(`update public.characters set campaign_id = '${campaignId}'`);
});

describe('who can read a character', () => {
	it('a player sees only their own, never a teammate in the same campaign', async () => {
		expect(names(await read(PLAYER))).toEqual(['Player One']);
		expect(names(await read(TEAMMATE))).toEqual(['Teammate One']);
	});

	it("the campaign's GM sees the characters in it", async () => {
		expect(names(await read(GM))).toEqual(['Player One', 'Teammate One']);
	});

	it("another campaign's GM and people signed out see nothing", async () => {
		expect((await read(RIVAL)).rows).toEqual([]);
		const anon = await read(null);
		expect(anon.rows).toEqual([]);
		expect(anon.error).toBe('42501');
	});

	it('a character put in a campaign its owner never joined stays hidden from that GM', async () => {
		await save(RIVAL, 'r1', 'Not A Member', 1000);
		await db.exec(`update public.characters set campaign_id = '${campaignId}' where id = 'r1'`);
		expect(names(await read(GM))).not.toContain('Not A Member');
	});

	it('the GM stops seeing a character when its owner leaves the campaign', async () => {
		expect(names(await read(GM))).toContain('Teammate One');
		await as(TEAMMATE, `delete from public.campaign_members where campaign_id = '${campaignId}' and user_id = '${TEAMMATE}'`);
		expect(names(await read(GM))).not.toContain('Teammate One');
		expect(names(await read(TEAMMATE))).toContain('Teammate One');
	});

	it('the GM stops seeing a deleted character; the owner still gets the marker', async () => {
		await save(PLAYER, 'p2', 'Deleted One', 1000);
		await db.exec(`update public.characters set campaign_id = '${campaignId}' where id = 'p2'`);
		expect(names(await read(GM))).toContain('Deleted One');
		await save(PLAYER, 'p2', 'Deleted One', 2000, 2000);
		expect(names(await read(GM))).not.toContain('Deleted One');
		expect(names(await read(PLAYER))).toContain('Deleted One');
	});
});

describe('who can write a character', () => {
	it('two players can use the same character id without touching each other', async () => {
		expect((await save(TEAMMATE, 'p1', 'Same Id', 5000)).error).toBeNull();
		expect(names(await read(PLAYER))).toContain('Player One');
		expect(names(await read(TEAMMATE))).toContain('Same Id');
	});

	it("can't edit another player's row, not even as the GM", async () => {
		for (const user of [TEAMMATE, GM, RIVAL]) {
			const r = await as(user, `update public.characters set data = '{"name":"Hacked"}' where user_id = '${PLAYER}'`);
			expect(r.affected).toBe(0);
		}
		expect(names(await read(PLAYER))).not.toContain('Hacked');
	});

	it("can't insert a row owned by someone else", async () => {
		const r = await as(TEAMMATE, `insert into public.characters (user_id, id, data, updated_at)
			values ('${PLAYER}', 'forged', '{}', 1)`);
		expect(r.error).toBe('42501');
	});

	it("can't delete rows, change owners or pick a campaign directly", async () => {
		expect((await as(PLAYER, `delete from public.characters where id = 'p1'`)).error).toBe('42501');
		expect((await as(PLAYER, `update public.characters set user_id = '${TEAMMATE}'`)).error).toBe('42501');
		expect((await as(PLAYER, `update public.characters set campaign_id = null`)).error).toBe('42501');
	});

	it('someone signed out can\'t save', async () => {
		expect((await save(null, 'n1', 'Nobody', 1000)).error).toBe('42501');
	});

	it('refuses a character that is not an object, or is huge', async () => {
		const notObject = await as(PLAYER, `select public.save_character('bad', '[1]'::jsonb, 1000)`);
		expect(notObject.error).toBe('23514');
		const huge = await save(PLAYER, 'big', 'x'.repeat(200001), 1000);
		expect(huge.error).toBe('23514');
	});
});

describe('newest save wins', () => {
	it('an older save is refused and reports null', async () => {
		await save(PLAYER, 'race', 'Newer', 5000);
		const r = await save(PLAYER, 'race', 'Older', 4000);
		expect(r.rows[0].stored).toBeNull();
		expect(names(await read(PLAYER))).toContain('Newer');
		expect(names(await read(PLAYER))).not.toContain('Older');
	});

	it('reports the stored time for a newer save', async () => {
		expect((await save(PLAYER, 'race', 'Newest', 6000)).rows[0].stored).toBe(6000);
	});

	it('caps a device clock set in the future, so other devices can still save', async () => {
		const future = Date.now() + 10 * 365 * 24 * 3600 * 1000;
		const r = await save(PLAYER, 'clock', 'Future', future);
		expect(Number(r.rows[0].stored)).toBeLessThanOrEqual(Date.now());
		const later = await save(PLAYER, 'clock', 'Next', Date.now() + 1000);
		expect(later.rows[0].stored).not.toBeNull();
	});
});

describe('past versions', () => {
	const versions = (user: string, id = 'hist') =>
		as(user, `select data from public.character_versions where character_id = '${id}' order by version_id desc`);

	it('keeps what was replaced, newest 20, for its owner only', async () => {
		for (let i = 1; i <= 25; i++) await save(PLAYER, 'hist', `v${i}`, 1000 + i);
		const mine = await versions(PLAYER);
		expect(mine.rows).toHaveLength(20);
		expect((mine.rows[0].data as { name: string }).name).toBe('v24');
		expect((await versions(TEAMMATE)).rows).toEqual([]);
		expect((await versions(GM)).rows).toEqual([]);
	});

	it('a refused save adds no version', async () => {
		const before = (await versions(PLAYER)).rows;
		await save(PLAYER, 'hist', 'too old', 1);
		expect((await versions(PLAYER)).rows).toEqual(before);
	});

	it("can't be written directly", async () => {
		const r = await as(PLAYER, `insert into public.character_versions (user_id, character_id, data, updated_at)
			values ('${PLAYER}', 'hist', '{}', 1)`);
		expect(r.error).toBe('42501');
	});
});

describe('placing a character in a campaign', () => {
	const place = (user: string | null, id: string, campaign: string | null) =>
		as(user, `select public.set_character_campaign($1, $2::uuid)`, [id, campaign]);
	const gmSees = async (name: string) => names(await read(GM)).includes(name);

	it('a member places their own, and the GM can then read it; taking it out hides it again', async () => {
		await save(PLAYER, 'placed', 'Placed One', 1000);
		expect(await gmSees('Placed One')).toBe(false);
		expect((await place(PLAYER, 'placed', campaignId)).error).toBeNull();
		expect(await gmSees('Placed One')).toBe(true);
		expect((await place(PLAYER, 'placed', null)).error).toBeNull();
		expect(await gmSees('Placed One')).toBe(false);
	});

	it("can't place it in a campaign they haven't joined", async () => {
		await save(RIVAL, 'r2', 'Outsider', 1000);
		expect((await place(RIVAL, 'r2', campaignId)).error).toBe('42501');
		expect(await gmSees('Outsider')).toBe(false);
	});

	it("can't place someone else's character, even as the GM", async () => {
		await save(PLAYER, 'mine', 'Mine Alone', 1000);
		expect((await place(GM, 'mine', campaignId)).error).toBe('P0002');
		expect(await gmSees('Mine Alone')).toBe(false);
	});

	it("can't place a deleted character, and signed out can't place anything", async () => {
		await save(PLAYER, 'gone', 'Gone', 1000, 1000);
		expect((await place(PLAYER, 'gone', campaignId)).error).toBe('P0002');
		expect((await place(null, 'mine', campaignId)).error).toBe('42501');
	});

	it('a later save keeps it in the campaign', async () => {
		await save(PLAYER, 'keep', 'Keeps Place', 1000);
		await place(PLAYER, 'keep', campaignId);
		await save(PLAYER, 'keep', 'Keeps Place Edited', 2000);
		expect(await gmSees('Keeps Place Edited')).toBe(true);
	});
});

