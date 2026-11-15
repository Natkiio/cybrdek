// Campaign maps (#62), on real Postgres (PGlite) with our real migrations and a
// stand-in for Supabase Storage's tables, so the storage policies are tested too.
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

const addMap = (user: string, campaign: string, name = 'Docks', width = 2000, height = 1000) =>
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

describe('maps', () => {
	it('the GM adds, names and activates maps; members and only members see them', async () => {
		const made = await addMap(GM, home, 'Docks');
		expect(made.error).toBeNull();
		const id = made.rows[0].id as string;
		expect((await as(GM, `select public.set_active_map($1, $2)`, [home, id])).error).toBeNull();
		const seen = await as(PLAYER, `select name, active from public.campaign_maps where campaign_id = $1`, [home]);
		expect(seen.rows).toEqual([{ name: 'Docks', active: true }]);
		expect((await as(STRANGER, `select 1 from public.campaign_maps where campaign_id = $1`, [home])).rows).toEqual([]);
		expect((await as(null, `select 1 from public.campaign_maps where campaign_id = $1`, [home])).rows).toEqual([]);
	});

	it("anyone can see a public campaign's maps", async () => {
		await addMap(GM, VOYAGE, 'Voyage Sewers');
		const anon = await as(null, `select name from public.campaign_maps where campaign_id = $1`, [VOYAGE]);
		expect(anon.rows).toEqual([{ name: 'Voyage Sewers' }]);
	});

	it("players, strangers and other GMs can't add, rename, activate or delete maps", async () => {
		const [map] = (await as(GM, `select id from public.campaign_maps where campaign_id = $1`, [home])).rows;
		for (const user of [PLAYER, STRANGER, RIVAL]) {
			expect((await addMap(user, home)).error).toBe('42501');
			await as(user, `update public.campaign_maps set name = 'Hacked' where id = $1`, [map.id]);
			await as(user, `delete from public.campaign_maps where id = $1`, [map.id]);
			expect((await as(user, `select public.set_active_map($1, null)`, [home])).error).toBe('42501');
		}
		const after = await as(GM, `select name, active from public.campaign_maps where id = $1`, [map.id]);
		expect(after.rows).toEqual([{ name: 'Docks', active: true }]);
	});

	it("a map can't be added already active, and only one is active at a time", async () => {
		const sneaky = await as(GM, `insert into public.campaign_maps (campaign_id, name, width, height, active) values ($1, 'X', 100, 100, true)`, [home]);
		expect(sneaky.error).toBe('42501'); // no grant on the active column
		const second = (await addMap(GM, home, 'Rooftops')).rows[0].id as string;
		await as(GM, `select public.set_active_map($1, $2)`, [home, second]);
		const active = await as(GM, `select name from public.campaign_maps where campaign_id = $1 and active`, [home]);
		expect(active.rows).toEqual([{ name: 'Rooftops' }]);
	});

	it("the GM can't activate another campaign's map from their own", async () => {
		const theirs = (await addMap(RIVAL, rivalGame, 'Theirs')).rows[0].id as string;
		expect((await as(GM, `select public.set_active_map($1, $2)`, [home, theirs])).error).toBe('42501');
	});

	it('stops at 10 maps per campaign', async () => {
		const count = Number((await as(GM, `select count(*) from public.campaign_maps where campaign_id = $1`, [home])).rows[0].count);
		for (let i = count; i < 10; i++) expect((await addMap(GM, home, `Map ${i}`)).error).toBeNull();
		expect((await addMap(GM, home, 'One too many')).error).toBe('23514');
	});
});

describe('pins on a map', () => {
	const pin = (user: string, campaign: string, map: string | null, x: number, y: number) =>
		as(user, `insert into public.map_pins (campaign_id, map_id, x, y, label, visible) values ($1, $2, $3, $4, 'Pin', true)`, [
			campaign,
			map,
			x,
			y
		]);

	it("sit inside their own map's size", async () => {
		const map = (await as(GM, `select id from public.campaign_maps where campaign_id = $1 and name = 'Rooftops'`, [home])).rows[0].id as string;
		expect((await pin(GM, home, map, 2000, 1000)).error).toBeNull(); // Rooftops is 2000 × 1000
		expect((await pin(GM, home, map, 2001, 10)).error).toBe('23514');
		expect((await pin(GM, home, map, 10, 1001)).error).toBe('23514');
	});

	it("Voyage City's built-in map keeps its 3840 × 2160 limit", async () => {
		expect((await pin(GM, VOYAGE, null, 3840, 2160)).error).toBeNull();
		expect((await pin(GM, VOYAGE, null, 3841, 10)).error).toBe('23514');
	});

	it("can't be put on another campaign's map", async () => {
		const theirs = (await as(RIVAL, `select id from public.campaign_maps where campaign_id = $1`, [rivalGame])).rows[0].id as string;
		expect((await pin(GM, home, theirs, 10, 10)).error).toBe('23514');
	});
});

describe('map image files', () => {
	let map = '';
	beforeAll(async () => {
		map = (await as(GM, `select id from public.campaign_maps where campaign_id = $1 and name = 'Docks'`, [home])).rows[0].id as string;
	});

	it('the bucket is private, WebP or JPEG only, 8 MB per file', async () => {
		const bucket = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'campaign-maps'`);
		expect(bucket.rows).toEqual([{ public: false, file_size_limit: 8388608, allowed_mime_types: ['image/webp', 'image/jpeg'] }]);
	});

	it("the GM uploads a map's two images; members see them, others don't", async () => {
		expect((await upload(GM, `${home}/${map}/full`)).error).toBeNull();
		expect((await upload(GM, `${home}/${map}/small`)).error).toBeNull();
		expect((await files(PLAYER)).rows).toHaveLength(2);
		expect((await files(STRANGER)).rows).toEqual([]);
		expect((await files(null)).rows).toEqual([]);
		expect((await files(RIVAL)).rows).toEqual([]);
	});

	it('players and other GMs cannot upload, replace or remove them', async () => {
		for (const user of [PLAYER, RIVAL, STRANGER]) {
			expect((await upload(user, `${home}/${map}/other`)).error).toBe('42501');
			await as(user, `delete from storage.objects where name like $1`, [`${home}/%`]);
		}
		expect((await upload(null, `${home}/${map}/full`)).error).not.toBeNull();
		expect((await files(GM)).rows.filter((r) => String(r.name).startsWith(home))).toHaveLength(2);
	});

	it('only the two expected names, under a real map of that campaign', async () => {
		expect((await upload(GM, `${home}/${map}/evil.svg`)).error).toBe('42501');
		expect((await upload(GM, `${home}/${map}/x/full`)).error).toBe('42501');
		expect((await upload(GM, `${home}/00000000-0000-4000-8000-00000000dead/full`)).error).toBe('42501');
		const theirs = (await as(RIVAL, `select id from public.campaign_maps where campaign_id = $1`, [rivalGame])).rows[0].id;
		expect((await upload(GM, `${home}/${theirs}/full`)).error).toBe('42501'); // their map, my campaign folder
		expect((await upload(GM, `${rivalGame}/${theirs}/full`)).error).toBe('42501'); // their campaign
	});

	it("anyone sees a public campaign's map images", async () => {
		const sewers = (await as(GM, `select id from public.campaign_maps where name = 'Voyage Sewers'`)).rows[0].id;
		await upload(GM, `${VOYAGE}/${sewers}/full`);
		expect((await files(null)).rows).toEqual([{ name: `${VOYAGE}/${sewers}/full` }]);
	});
});
