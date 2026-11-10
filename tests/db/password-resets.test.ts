// Password reset codes, on real Postgres (PGlite) with our real migrations.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const ADMIN = '10000000-0000-4000-8000-000000000001';
const PLAYER = '10000000-0000-4000-8000-000000000002';
const CAMPAIGN_GM = '10000000-0000-4000-8000-000000000003';
const EMAIL: Record<string, string> = {
	[ADMIN]: 'admin@example.com',
	[PLAYER]: 'player@example.com',
	[CAMPAIGN_GM]: 'gm@example.com'
};

const db = new PGlite();

type Role = 'anon' | 'authenticated' | 'service_role';
async function run(role: Role, user: string | null, sql: string, params: unknown[] = []) {
	await db.exec(`begin; set local role ${role};
		select set_config('test.uid', '${user ?? ''}', true),
		       set_config('test.email', '${user ? EMAIL[user] : ''}', true);`);
	try {
		const { rows } = await db.query<Record<string, unknown>>(sql, params);
		await db.exec('commit');
		return { rows, error: null as string | null };
	} catch (e) {
		await db.exec('rollback');
		return { rows: [], error: (e as { code?: string }).code ?? String(e) };
	}
}
const as = (user: string | null, sql: string, params: unknown[] = []) =>
	run(user ? 'authenticated' : 'anon', user, sql, params);

const issue = (user: string | null, email: string) =>
	as(user, `select public.issue_password_reset($1) as code`, [email]);
const claim = (email: string, code: string) =>
	run('service_role', null, `select public.claim_password_reset($1, $2) as player`, [email, code]);
const codeFor = async (email: string) => (await issue(ADMIN, email)).rows[0].code as string;

beforeAll(async () => {
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create schema auth;
		grant usage on schema auth, public to anon, authenticated, service_role;
		create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
		create function auth.uid() returns uuid language sql stable as
			$$ select nullif(current_setting('test.uid', true), '')::uuid $$;
		create function auth.jwt() returns jsonb language sql stable as
			$$ select jsonb_build_object('email', nullif(current_setting('test.email', true), '')) $$;
		grant execute on all functions in schema auth to anon, authenticated, service_role;
		insert into auth.users (id, email) values
			('${ADMIN}', 'admin@example.com'), ('${PLAYER}', 'Player@Example.com'), ('${CAMPAIGN_GM}', 'gm@example.com');
	`);
	const dir = 'supabase/migrations';
	for (const file of readdirSync(dir).sort()) {
		if (file.includes('_campaigns')) await db.exec(`insert into public.gms (email) values ('admin@example.com')`);
		await db.exec(readFileSync(`${dir}/${file}`, 'utf8'));
	}
	await as(CAMPAIGN_GM, `select public.create_campaign('Their Game')`);
});

describe('issuing a code', () => {
	it('the admin gets a readable one-time code for a player, by email in any case', async () => {
		const r = await issue(ADMIN, '  PLAYER@example.com ');
		expect(r.error).toBeNull();
		expect(r.rows[0].code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
	});

	it("a campaign's GM, a player and someone signed out can't", async () => {
		expect((await issue(CAMPAIGN_GM, 'player@example.com')).error).toBe('42501');
		expect((await issue(PLAYER, 'admin@example.com')).error).toBe('42501');
		expect((await issue(null, 'player@example.com')).error).toBe('42501');
	});

	it('says so when no account uses the email', async () => {
		expect((await issue(ADMIN, 'nobody@example.com')).error).toBe('P0002');
	});

	it('stores only a hash, and nobody can read the table through the API', async () => {
		const code = await codeFor('player@example.com');
		const stored = await db.query<{ code_hash: string }>(`select code_hash from public.password_resets`);
		expect(stored.rows.map((r) => r.code_hash)).not.toContain(code);
		for (const user of [ADMIN, PLAYER, null]) {
			const r = await as(user, `select * from public.password_resets`);
			expect(r.rows).toEqual([]); // refused outright, or RLS shows nothing
		}
	});
});

describe('claiming a code', () => {
	it('the right code gives the player once, however it is typed', async () => {
		const code = await codeFor('player@example.com');
		const typed = ` ${code.toLowerCase().replaceAll('-', ' ')} `;
		expect((await claim('player@example.com', typed)).rows[0].player).toBe(PLAYER);
		expect((await claim('player@example.com', code)).rows[0].player).toBeNull();
	});

	it("a code only works for the account it was issued for", async () => {
		const code = await codeFor('player@example.com');
		expect((await claim('gm@example.com', code)).rows[0].player).toBeNull();
		expect((await claim('player@example.com', code)).rows[0].player).toBe(PLAYER);
	});

	it('a new code replaces the old one', async () => {
		const first = await codeFor('player@example.com');
		const second = await codeFor('player@example.com');
		expect((await claim('player@example.com', first)).rows[0].player).toBeNull();
		expect((await claim('player@example.com', second)).rows[0].player).toBe(PLAYER);
	});

	it('five wrong tries and even the right code stops working', async () => {
		const code = await codeFor('player@example.com');
		for (let i = 0; i < 5; i++) expect((await claim('player@example.com', '0000-0000-0000')).rows[0].player).toBeNull();
		expect((await claim('player@example.com', code)).rows[0].player).toBeNull();
	});

	it('expires after 30 minutes', async () => {
		const code = await codeFor('player@example.com');
		await db.exec(`update public.password_resets set expires_at = now() - interval '1 second'`);
		expect((await claim('player@example.com', code)).rows[0].player).toBeNull();
	});

	it('players, the admin and signed-out callers can never claim directly', async () => {
		const code = await codeFor('player@example.com');
		for (const user of [PLAYER, ADMIN, null]) {
			const r = await as(user, `select public.claim_password_reset($1, $2)`, ['player@example.com', code]);
			expect(r.error).toBe('42501');
		}
		expect((await claim('player@example.com', code)).rows[0].player).toBe(PLAYER);
	});
});
