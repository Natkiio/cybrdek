// GM-drawn map areas (districts and wards), on real Postgres (PGlite) with our real
// migrations: who reads them, who saves them, validation and revision checks.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { SUPABASE_DEFAULT_GRANTS } from './supabase-defaults.ts';

const VOYAGE = '00000000-0000-4000-8000-000000000001';
const GM = '10000000-0000-4000-8000-000000000001'; // runs Voyage City and "Home Game"
const PLAYER = '10000000-0000-4000-8000-000000000002'; // in Home Game
const STRANGER = '10000000-0000-4000-8000-000000000003';
const RIVAL = '10000000-0000-4000-8000-000000000004'; // GM of another campaign

const db = new PGlite();
let home = '';
let rivalGame = '';

async function as(user: string | null, sql: string, params: unknown[] = []) {
	await db.exec(`begin; set local role ${user ? 'authenticated' : 'anon'};
		select set_config('test.uid', '${user ?? ''}', true);`);
	try {
		const { rows } = await db.query<Record<string, unknown>>(sql, params);
		await db.exec('commit');
		return { rows, error: null as string | null };
	} catch (e) {
		await db.exec('rollback');
		return { rows: [], error: (e as { code?: string }).code ?? String(e) };
	}
}

const addMapRaw = (user: string, campaign: string, name = 'Docks', width = 2000, height = 1000) =>
	as(user, `insert into public.campaign_maps (campaign_id, name, width, height) values ($1, $2, $3, $4) returning id`, [
		campaign,
		name,
		width,
		height
	]);
const upload = (user: string | null, path: string) =>
	as(user, `insert into storage.objects (bucket_id, name) values ('campaign-maps', $1)`, [path]);
const files = (user: string | null) => as(user, `select name from storage.objects order by name`);

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
			('${STRANGER}', 'stranger@example.com'), ('${RIVAL}', 'rival@example.com');

		-- The parts of Supabase Storage the migration uses.
		create schema storage;
		grant usage on schema storage to anon, authenticated;
		create table storage.buckets (id text primary key, name text, public boolean,
			file_size_limit bigint, allowed_mime_types text[]);
		create table storage.objects (id uuid primary key default gen_random_uuid(),
			bucket_id text references storage.buckets (id), name text, unique (bucket_id, name));
		alter table storage.objects enable row level security;
		grant select, insert, update, delete on storage.objects to anon, authenticated;
	`);
	await db.exec(SUPABASE_DEFAULT_GRANTS);
	const dir = 'supabase/migrations';
	for (const file of readdirSync(dir).sort()) {
		if (file.includes('_campaigns')) await db.exec(`insert into public.gms (email) values ('gm@example.com')`);
		await db.exec(readFileSync(`${dir}/${file}`, 'utf8'));
	}
	home = (await as(GM, `select public.create_campaign('Home Game') as id`)).rows[0].id as string;
	const code = (await as(GM, `select code from public.campaign_invites where campaign_id = '${home}'`)).rows[0].code;
	await as(PLAYER, `select public.join_campaign('${code}')`);
	rivalGame = (await as(RIVAL, `select public.create_campaign('Rival Game') as id`)).rows[0].id as string;
});

const addMap = async (user: string, campaign: string, width = 2000, height = 1000) =>
	(await addMapRaw(user, campaign, 'Docks', width, height)).rows[0]?.id as string;
const save = (user: string | null, campaign: string, map: string | null, revision: number, areas: unknown) =>
	as(user, `select public.save_map_areas($1, $2, $3, $4) as v`, [campaign, map, revision, JSON.stringify(areas)]);
const read = (user: string | null, campaign: string) =>
	as(user, `select map_id, areas, revision from public.map_areas where campaign_id = $1 order by map_id nulls first`, [campaign]);

const square = (x: number, y: number, s = 100): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const district = { id: 'docks', name: 'Docks', kind: 'district', polygon: square(100, 100, 400), label: [300, 300] };
const ward = { id: 'pier-9', name: 'Pier 9', kind: 'ward', parentId: 'docks', polygon: square(150, 150), label: [200, 200] };

describe('map areas', () => {
	it('the GM saves areas for an uploaded map; members read them, strangers do not', async () => {
		const map = await addMap(GM, home);
		const first = await save(GM, home, map, 0, [district, ward]);
		expect(first.error).toBeNull();
		expect(first.rows[0].v).toBe(1);
		const seen = await read(PLAYER, home);
		expect(seen.rows).toHaveLength(1);
		expect((seen.rows[0].areas as { name: string }[]).map((a) => a.name)).toEqual(['Docks', 'Pier 9']);
		expect((await read(STRANGER, home)).rows).toHaveLength(0);
		expect((await read(null, home)).rows).toHaveLength(0);
	});

	it('only the GM saves, and only with the current revision', async () => {
		const map = await addMap(GM, home);
		expect((await save(PLAYER, home, map, 0, [district])).error).toBe('42501');
		expect((await save(RIVAL, home, map, 0, [district])).error).toBe('42501');
		expect((await save(GM, home, map, 0, [district])).rows[0].v).toBe(1);
		expect((await save(GM, home, map, 0, [district, ward])).error).toBe('40001'); // stale tab
		expect((await save(GM, home, map, 1, [district, ward])).rows[0].v).toBe(2);
		// Direct writes are not allowed at all, even for the GM.
		expect((await as(GM, `update public.map_areas set areas = '[]' where map_id = $1`, [map])).error).toBe('42501');
	});

	it("rejects bad shapes, orphan wards, points off the map and another campaign's map", async () => {
		const map = await addMap(GM, home, 500, 500);
		expect((await save(GM, home, map, 0, [{ ...district, polygon: [[0, 0], [1, 1]] }])).error).toBe('23514');
		expect((await save(GM, home, map, 0, [ward])).error).toBe('23514'); // its district is missing
		expect((await save(GM, home, map, 0, [{ ...district, polygon: square(400, 400, 200) }])).error).toBe('23514'); // past 500
		expect((await save(GM, home, map, 0, [district, { ...district }])).error).toBe('23514'); // duplicate id
		const rivalMap = await addMap(RIVAL, rivalGame);
		expect((await save(GM, home, rivalMap, 0, [district])).error).toBe('42501');
	});

	it("Voyage City's built-in map (no map id) is saved once per campaign, and readable publicly", async () => {
		expect((await save(GM, VOYAGE, null, 0, [district, ward])).rows[0].v).toBe(1);
		expect((await save(GM, VOYAGE, null, 1, [district])).rows[0].v).toBe(2);
		const seen = await read(null, VOYAGE);
		expect(seen.rows).toHaveLength(1);
		expect(seen.rows[0].map_id).toBeNull();
		expect(Number(seen.rows[0].revision)).toBe(2);
	});

	it('deleting the map deletes its areas', async () => {
		const map = await addMap(GM, home);
		await save(GM, home, map, 0, [district]);
		await as(GM, `delete from public.campaign_maps where id = $1`, [map]);
		expect((await as(GM, `select 1 from public.map_areas where map_id = $1`, [map])).rows).toHaveLength(0);
	});
});
