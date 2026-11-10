// Row-level security tests, on real Postgres (PGlite) with our real migrations.
// A small stand-in provides the Supabase parts migrations rely on.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { SUPABASE_DEFAULT_GRANTS } from './supabase-defaults.ts';

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

const titles = (r: { rows: Record<string, unknown>[] }) => r.rows.map((x) => x.title).sort();
let rivalCampaign = '';
let rivalCode = '';

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
	await db.exec(SUPABASE_DEFAULT_GRANTS);
	const dir = 'supabase/migrations';
	for (const file of readdirSync(dir).sort()) {
		if (file.includes('_campaigns')) {
			// Data that already exists when this migration runs on the live database.
			await db.exec(`
				insert into public.gms (email) values ('gm@example.com');
				insert into public.lore_entries (slug, title, visible) values
					('araki', 'Araki', true), ('secret', 'Secret Plan', false);
				insert into public.map_pins (x, y, label, visible) values
					(10, 10, 'Topaz', true), (20, 20, 'Hidden Pin', false);
				insert into public.map_districts (district_id, name) values ('akiba', 'Araki');
			`);
		}
		await db.exec(readFileSync(`${dir}/${file}`, 'utf8'));
	}
	const made = await as(RIVAL, `select public.create_campaign('Rival Game') as id`);
	rivalCampaign = made.rows[0].id as string;
	await as(RIVAL, `insert into public.lore_entries (campaign_id, slug, title, visible)
		values ('${rivalCampaign}', 'araki', 'Rival Araki', true), ('${rivalCampaign}', 'plot', 'Rival Plot', false)`);
	rivalCode = (await as(RIVAL, 'select code from public.campaign_invites')).rows[0].code as string;
});

describe('moving existing data', () => {
	it('keeps everything, in a public Voyage City owned by the old GM', async () => {
		const { rows } = await db.query<{ n: number }>(
			`select count(*)::int as n from public.lore_entries where campaign_id = '${VOYAGE}'`
		);
		expect(rows[0].n).toBe(2);
		const members = await db.query(`select user_id, role from public.campaign_members where campaign_id = '${VOYAGE}'`);
		expect(members.rows).toEqual([{ user_id: GM, role: 'gm' }]);
		const pins = await db.query(`select count(*)::int as n from public.map_pins where campaign_id = '${VOYAGE}'`);
		expect(pins.rows[0]).toEqual({ n: 2 });
		const edits = await db.query(`select name from public.map_districts where campaign_id = '${VOYAGE}'`);
		expect(edits.rows).toEqual([{ name: 'Araki' }]);
	});

	it('lets the deployed app keep writing without a campaign_id', async () => {
		const made = await as(GM, `insert into public.lore_entries (slug, title) values ('old-app', 'Old App') returning campaign_id`);
		expect(made.rows[0].campaign_id).toBe(VOYAGE);
		await as(GM, `delete from public.lore_entries where slug = 'old-app'`);
	});
});

describe('reading', () => {
	const lore = `select title from public.lore_entries`;

	it('no account: only visible lore in public campaigns', async () => {
		expect(titles(await as(null, lore))).toEqual(['Araki']);
	});

	it("a GM sees all of their campaign, and only visible public lore elsewhere", async () => {
		expect(titles(await as(GM, lore))).toEqual(['Araki', 'Secret Plan']);
		expect(titles(await as(RIVAL, lore))).toEqual(['Araki', 'Rival Araki', 'Rival Plot']);
	});

	it('a stranger sees nothing of a private campaign', async () => {
		expect(titles(await as(STRANGER, lore))).toEqual(['Araki']);
		const c = await as(STRANGER, `select name from public.campaigns`);
		expect(c.rows).toEqual([{ name: 'Voyage City' }]);
	});

	it('hides hidden pins, and pins linked to hidden lore', async () => {
		await db.exec(`insert into public.map_pins (x, y, label, visible, lore_entry_id)
			select 30, 30, 'Secret Link', true, id from public.lore_entries where slug = 'secret'`);
		const pins = await as(null, `select label from public.map_pins`);
		expect(pins.rows).toEqual([{ label: 'Topaz' }]);
		expect((await as(GM, `select label from public.map_pins`)).rows).toHaveLength(3);
	});
});

describe('invites', () => {
	it('only GMs can read an invite', async () => {
		expect((await as(GM, `select code from public.campaign_invites`)).rows).toHaveLength(1);
		expect((await as(STRANGER, `select code from public.campaign_invites`)).rows).toEqual([]);
		expect((await as(null, `select code from public.campaign_invites`)).error).toBe('42501');
	});

	it('joining needs an account and a real code', async () => {
		expect((await as(null, `select public.join_campaign('${rivalCode}')`)).error).toBe('42501');
		expect((await as(STRANGER, `select public.join_campaign('nope')`)).error).toBe('P0002');
	});

	it('a joined player reads visible lore only, and can write nothing', async () => {
		await as(PLAYER, `select public.join_campaign('${rivalCode}')`);
		const seen = titles(await as(PLAYER, `select title from public.lore_entries where campaign_id = '${rivalCampaign}'`));
		expect(seen).toEqual(['Rival Araki']);
		const added = await as(PLAYER, `insert into public.lore_entries (campaign_id, slug, title) values ('${rivalCampaign}', 'x', 'X')`);
		expect(added.error).toBe('42501');
		const changed = await as(PLAYER, `update public.lore_entries set title = 'Hacked' where campaign_id = '${rivalCampaign}'`);
		expect(changed.affected).toBe(0);
		expect((await as(PLAYER, `select code from public.campaign_invites`)).rows).toEqual([]);
	});

	it('joining again never changes a role', async () => {
		await as(RIVAL, `select public.join_campaign('${rivalCode}')`);
		expect((await as(RIVAL, `select public.is_campaign_gm('${rivalCampaign}') as gm`)).rows[0].gm).toBe(true);
	});
});

describe('one GM in another campaign', () => {
	const voyage = (sql: string) => sql.replaceAll('$V', `'${VOYAGE}'`);

	it('cannot add, change or delete anything in it', async () => {
		const add = await as(RIVAL, voyage(`insert into public.lore_entries (campaign_id, slug, title) values ($V, 'evil', 'Evil')`));
		expect(add.error).toBe('42501');
		expect((await as(RIVAL, voyage(`update public.lore_entries set title = 'Hacked' where campaign_id = $V`))).affected).toBe(0);
		expect((await as(RIVAL, voyage(`delete from public.lore_entries where campaign_id = $V`))).affected).toBe(0);
		expect((await as(RIVAL, voyage(`insert into public.map_pins (campaign_id, x, y, label) values ($V, 1, 1, 'x')`))).error).toBe('42501');
		expect((await as(RIVAL, voyage(`update public.map_districts set name = 'x' where campaign_id = $V`))).affected).toBe(0);
	});

	it('cannot move its own lore into another campaign', async () => {
		const moved = await as(RIVAL, voyage(`update public.lore_entries set campaign_id = $V where slug = 'plot'`));
		expect(moved.error).toBe('42501');
		// A visible entry too: the read rule can't be what's stopping this one.
		await as(RIVAL, `insert into public.lore_entries (campaign_id, slug, title, visible) values ('${rivalCampaign}', 'open-note', 'Open Note', true)`);
		const visible = await as(RIVAL, voyage(`update public.lore_entries set campaign_id = $V where slug = 'open-note'`));
		expect(visible.error).toBe('42501');
		await as(RIVAL, `delete from public.lore_entries where slug = 'open-note'`);
	});

	it('cannot make itself a member directly, or publish a campaign', async () => {
		const self = await as(RIVAL, voyage(`insert into public.campaign_members (campaign_id, user_id, role) values ($V, '${RIVAL}', 'gm')`));
		expect(self.error).toBe('42501');
		const pub = await as(RIVAL, `update public.campaigns set is_public = true where id = '${rivalCampaign}'`);
		expect(pub.error).toBe('42501');
	});
});

describe('campaigns', () => {
	it('anyone signed in can create one and is its GM; no account cannot', async () => {
		expect((await as(null, `select public.create_campaign('x')`)).error).toBe('42501');
		const made = await as(STRANGER, `select public.create_campaign('Mine') as id`);
		const id = made.rows[0].id as string;
		expect((await as(STRANGER, `select public.is_campaign_gm('${id}') as gm`)).rows[0].gm).toBe(true);
		expect((await as(STRANGER, `select count(*)::int as n from public.campaign_invites`)).rows[0].n).toBe(1);
	});

	it('the same title can exist in two campaigns, but not twice in one', async () => {
		const twice = await as(RIVAL, `insert into public.lore_entries (campaign_id, slug, title) values ('${rivalCampaign}', 'araki', 'Again')`);
		expect(twice.error).toBe('23505');
	});

	it('a GM can remove a player, not another GM; players can leave', async () => {
		expect((await as(PLAYER, `delete from public.campaign_members where user_id = '${RIVAL}'`)).affected).toBe(0);
		expect((await as(RIVAL, `delete from public.campaign_members where user_id = '${PLAYER}' and campaign_id = '${rivalCampaign}'`)).affected).toBe(1);
		expect((await as(RIVAL, `delete from public.campaign_members where user_id = '${RIVAL}'`)).affected).toBe(0);
	});
});
