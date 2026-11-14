// Row-level security tests, on real Postgres (PGlite) with our real migrations.
// A small stand-in provides the Supabase parts migrations rely on.
import { readdirSync, readFileSync } from 'node:fs';
import { makePc, makeNpc, newEncounter, spOf } from '../../src/lib/combat/encounter.ts';
import { woundState } from '../../src/lib/rulesets/red/wounds.ts';
import { SUPABASE_DEFAULT_GRANTS } from './supabase-defaults.ts';
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
	await db.exec(SUPABASE_DEFAULT_GRANTS);
	for (const file of readdirSync('supabase/migrations').sort()) {
		if (file.includes('_campaigns')) await db.exec(`insert into public.gms(email) values ('gm@example.com')`);
		await db.exec(readFileSync(file.endsWith('_campaign_encounters.sql') && process.env.ENCOUNTER_MIGRATION_OVERRIDE
			? process.env.ENCOUNTER_MIGRATION_OVERRIDE
			: file.endsWith('_fight_damage_offers.sql') && process.env.DAMAGE_MIGRATION_OVERRIDE
				? process.env.DAMAGE_MIGRATION_OVERRIDE : `supabase/migrations/${file}`, 'utf8'));
	}
	rivalCampaign = (await as(RIVAL, `select public.create_campaign('Other') as id`)).rows[0].id as string;
	await db.exec(`insert into public.campaign_members(campaign_id, user_id, role) values ('${VOYAGE}', '${PLAYER}', 'player'), ('${VOYAGE}', '${STRANGER}', 'player');
		insert into public.characters(user_id, id, data, updated_at, campaign_id) values
		('${PLAYER}', 'same-backup', '{}', 1000, '${VOYAGE}'),
		('${STRANGER}', 'same-backup', '{}', 1000, '${VOYAGE}'),
		('${RIVAL}', 'foreign', '{}', 1000, '${rivalCampaign}');`);
});
afterAll(() => db.close());


const npc = () => ({ ...makeNpc('npc', { name: 'Secret NPC', ref: 8, hp: 50, spHead: 7, spBody: 11 }),
	secret: 'DO NOT SEND', hiddenStats: { REF: 8 }, side: 'pc' }); // side is not trusted
const pc = (owner: string, id: string) => ({ ...makePc(id, {
	id: 'same-backup', name: owner === PLAYER ? 'Player PC' : 'Teammate PC', rulesetId: 'cyberpunk-red',
	stats: { BODY: 6, WILL: 6, EMP: 6, REF: 6 }, skills: {}, extra: { gear: [
		{ id: 'suit', kind: 'armor' as const, name: 'Bodyweight Suit', sp: 11, location: 'body' as const, currentSp: { head: 5, body: 8 } }
	] }
}), characterOwnerId: owner });
const snapshot = () => ({ ...newEncounter(), combatants: [npc(), pc(PLAYER, 'own'), pc(STRANGER, 'other')] });
const view = (user: string | null, campaign = VOYAGE, owner = user) =>
	as(user, 'select public.campaign_encounter_view($1,$2) as v', [campaign, owner]);
async function save(user: string | null, state: unknown, id: string | null = null, revision = 0, campaign = VOYAGE, finish = false, owner = user) {
	return as(user, 'select public.save_campaign_encounter($1,$2,$3,$4,$5,$6) as v', [campaign, owner, id, revision, JSON.stringify(state), finish]);
}
let fight: { id: string; revision: number };

describe('campaign encounters: grants, writes and isolation', () => {
	it('explicitly permits RPCs, but no API role can select or mutate raw snapshots', async () => {
		for (const user of [GM, PLAYER, RIVAL, null]) {
			expect((await as(user, 'select * from public.campaign_encounters')).error).toBe('42501');
			expect((await as(user, 'update public.campaign_encounters set revision = 1')).error).toBe('42501');
			expect((await as(user, 'delete from public.campaign_encounters')).error).toBe('42501');
		}
		const rights = await db.query(`select has_function_privilege('anon','public.campaign_encounter_view(uuid,uuid)','execute') as anon,
			has_function_privilege('authenticated','public.encounter_sp(jsonb,text)','execute') as helper,
			has_table_privilege('authenticated','public.campaign_encounters','insert') as raw,
			has_table_privilege('authenticated','public.campaign_encounter_updates','update') as signals`);
		expect(rights.rows).toEqual([{ anon: false, helper: false, raw: false, signals: false }]);
	});
	it('only the campaign GM creates a fight, including when a player tries to add themself', async () => {
		for (const user of [PLAYER, STRANGER, RIVAL, null]) expect((await save(user, snapshot())).error).toBe('42501');
		const made = await save(GM, snapshot());
		expect(made.error).toBeNull(); fight = made.rows[0].v as typeof fight;
		expect(fight.revision).toBe(1);
	});
	it('no non-GM can change, finish, or move the fight, even as a GM elsewhere', async () => {
		for (const user of [PLAYER, STRANGER, RIVAL, null]) {
			expect((await save(user, newEncounter(), fight.id, 1)).error).toBe('42501');
			expect((await save(user, snapshot(), fight.id, 1, VOYAGE, true)).error).toBe('42501');
		}
		expect((await save(RIVAL, snapshot(), fight.id, 1, rivalCampaign)).error).toBe('40001');
	});
	it('nonmembers cannot read a public campaign fight or its notifications; sessions cannot impersonate owners', async () => {
		for (const user of [RIVAL, null]) expect((await view(user)).error).toBe('42501');
		expect((await view(PLAYER, rivalCampaign)).error).toBe('42501');
		expect((await view(PLAYER, VOYAGE, GM)).error).toBe('42501');
		expect((await save(GM, snapshot(), fight.id, 1, VOYAGE, false, PLAYER)).error).toBe('42501');
		expect((await as(RIVAL, 'select * from public.campaign_encounter_updates')).rows).toEqual([]);
		expect((await as(PLAYER, 'select * from public.campaign_encounter_updates')).rows).toEqual([{ campaign_id: VOYAGE, revision: 1 }]);
	});
	it('stale writes and a second active fight are refused without changing data', async () => {
		const next = snapshot(); next.combatants[0].hp = 20;
		const updated = await save(GM, next, fight.id, 1);
		expect(updated.error).toBeNull(); fight = updated.rows[0].v as typeof fight;
		expect((await save(GM, snapshot(), fight.id, 1)).error).toBe('40001');
		expect((await save(GM, snapshot())).error).toBe('40001');
		expect(fight.revision).toBe(2);
	});
	it('rejects invalid snapshots and foreign/nonmember character references', async () => {
		for (const invalid of [{}, { ...snapshot(), combatants: [npc(), npc()] }, { ...snapshot(), round: -1 }, { ...snapshot(), currentId: false }]) {
			expect((await save(GM, invalid, fight.id, 2)).error).toBe('23514');
		}
		const bad = { ...newEncounter(), combatants: [{ ...npc(), characterOwnerId: RIVAL, characterId: 'foreign' }] };
		expect((await save(GM, bad, fight.id, 2)).error).toBe('42501');
	});
});

describe('server-built player views', () => {
	it('GM receives the raw snapshot, players receive only allowlisted fields', async () => {
		const raw = (await view(GM)).rows[0].v as any;
		expect(raw.canManage).toBe(true); expect(raw.encounter.combatants[0].secret).toBe('DO NOT SEND');
		const player = (await view(PLAYER)).rows[0].v as any;
		expect(player.canManage).toBe(false);
		const [enemy, own, teammate] = player.encounter.combatants;
		expect(Object.keys(enemy).sort()).toEqual(['id','name','side','wound']);
		expect(enemy).toMatchObject({ side: 'npc', wound: 'seriously' });
		expect(Object.keys(teammate).sort()).toEqual(['id','name','side','wound']);
		expect(own).toMatchObject({ characterId: 'same-backup', hp: 40, maxHp: 40, sp: { head: 5, body: 8 } });
		expect(JSON.stringify(player)).not.toMatch(/DO NOT SEND|hiddenStats|"ref"|"gear"|"secret"|"initiative"/);
		const other = (await view(STRANGER)).rows[0].v as any;
		expect(other.encounter.combatants[1]).not.toHaveProperty('hp');
		expect(other.encounter.combatants[2]).toHaveProperty('hp', 40);
	});
	it('wound and own SP calculations match the existing engine, including dual-location armor', async () => {
		for (const hp of [40, 39, 20, 19, 0]) {
			const s = snapshot(); s.combatants[1].hp = hp;
			s.combatants[1].gear.push({ id: 'vest', kind: 'armor', name: 'Vest', sp: 9, location: 'body' });
			s.combatants[1].gear.push({ id: 'off', kind: 'armor', name: 'Unworn helmet', sp: 30, location: 'head', equipped: false });
			const saved = await save(GM, s, fight.id, fight.revision); expect(saved.error).toBeNull(); fight = saved.rows[0].v as typeof fight;
			const own = ((await view(PLAYER)).rows[0].v as any).encounter.combatants[1];
			expect(own.wound).toBe(woundState(hp, 40)); expect(own.sp).toEqual(spOf(s.combatants[1]));
		}
	});
	it('death is explicit, never inferred from knockout; turn order and current turn survive redaction', async () => {
		const s = { ...snapshot(), started: true, round: 2, currentId: 'npc' };
		s.combatants[0] = { ...npc(), hp: 0, dead: true, out: true } as any;
		const saved = await save(GM, s, fight.id, fight.revision); expect(saved.error).toBeNull(); fight = saved.rows[0].v as typeof fight;
		const p = (await view(PLAYER)).rows[0].v as any;
		expect(p.encounter).toMatchObject({ started: true, round: 2, currentId: 'npc' });
		expect(p.encounter.combatants.map((c: any) => c.id)).toEqual(['npc','own','other']);
		expect(p.encounter.combatants[0].wound).toBe('dead');
	});
	it('ending retains immutable results and allows a new fight without overwriting the old one', async () => {
		const s = snapshot();
		(s.combatants[1] as any).startingHp = 9999;
		const ended = await save(GM, s, fight.id, fight.revision, VOYAGE, true); expect(ended.error).toBeNull();
		expect((ended.rows[0].v as any).ended).toBe(true);
		expect((ended.rows[0].v as any).encounter.combatants[1].startingHp).toBe(40);
		expect((await save(GM, s, fight.id, (ended.rows[0].v as any).revision)).error).toBe('40001');
		const made = await save(GM, newEncounter()); expect(made.error).toBeNull();
		expect((made.rows[0].v as any).id).not.toBe(fight.id);
		const kept = await db.query('select count(*)::int as n from public.campaign_encounters'); expect(kept.rows[0].n).toBe(2);
		// No write-back to the private character data.
		const characters = await db.query('select data from public.characters'); expect(characters.rows.every((c: any) => JSON.stringify(c.data) === '{}')).toBe(true);
	});
	it('membership removal revokes views and notifications immediately', async () => {
		await as(GM, `delete from public.campaign_members where user_id = $1`, [PLAYER]);
		expect((await view(PLAYER)).error).toBe('42501');
		expect((await as(PLAYER, 'select * from public.campaign_encounter_updates')).rows).toEqual([]);
	});
});

describe('owner-only damage offers from retained finished fights', () => {
	it('offers nothing while active; finishing only exposes the owner’s net HP damage', async () => {
		// Previous tests removed PLAYER; rejoin for this separate acceptance flow.
		await db.exec(`insert into public.campaign_members(campaign_id,user_id,role) values ('${VOYAGE}','${PLAYER}','player')`);
		const active = (await view(GM)).rows[0].v as any;
		let saved = await save(GM, snapshot(), active.id, active.revision); expect(saved.error).toBeNull();
		const v = saved.rows[0].v as any;
		const hurt = snapshot(); hurt.combatants[1].hp = 10; hurt.combatants[2].hp = 15; hurt.combatants[0].hp = 1;
		saved = await save(GM, hurt, v.id, v.revision); expect(saved.error).toBeNull();
		expect((await as(PLAYER, 'select public.campaign_damage_offers($1,$2) as offers', [VOYAGE,PLAYER])).rows[0].offers).toEqual([]);
		const live = saved.rows[0].v as any;
		expect((await save(GM, hurt, live.id, live.revision, VOYAGE, true)).error).toBeNull();
		const own = await as(PLAYER, 'select public.campaign_damage_offers($1,$2) as offers', [VOYAGE,PLAYER]);
		const offers = own.rows[0].offers as any[];
		expect(offers).toHaveLength(1); expect(offers[0]).toMatchObject({ characterId: 'same-backup', damage: 30, name: 'Player PC' });
		expect(Object.keys(offers[0]).sort()).toEqual(['characterId','damage','encounterId','endedAt','name']);
		const other = await as(STRANGER, 'select public.campaign_damage_offers($1,$2) as offers', [VOYAGE,STRANGER]);
		expect((other.rows[0].offers as any[])[0].damage).toBe(25);
		const gm = await as(GM, 'select public.campaign_damage_offers($1,$2) as offers', [VOYAGE,GM]); expect(gm.rows[0].offers).toEqual([]);
		for (const user of [GM, RIVAL, null]) {
			expect((await as(user, 'select public.campaign_damage_offers($1,$2)', [VOYAGE,PLAYER])).error).toBe('42501');
		}
		expect((await as(RIVAL, 'select public.campaign_damage_offers($1,$2)', [VOYAGE,RIVAL])).error).toBe('42501');
		expect((await as(PLAYER, 'select public.campaign_damage_offers($1,$2)', [rivalCampaign,PLAYER])).error).toBe('42501');
		expect((await as(PLAYER, 'select public.campaign_damage_offers($1,null)', [VOYAGE])).error).toBe('42501');
		await db.exec(`insert into public.campaign_members(campaign_id,user_id,role) values ('${rivalCampaign}','${PLAYER}','player')`);
		expect((await as(PLAYER, 'select public.campaign_damage_offers($1,$2) as offers', [rivalCampaign,PLAYER])).rows[0].offers).toEqual([]);
		await as(GM, 'delete from public.campaign_members where user_id=$1', [PLAYER]);
		expect((await as(PLAYER, 'select public.campaign_damage_offers($1,$2)', [VOYAGE,PLAYER])).error).toBe('42501');
		await db.exec(`insert into public.campaign_members(campaign_id,user_id,role) values ('${VOYAGE}','${PLAYER}','player')`);
		// The offer itself never writes a sheet. Only the owner’s sync publishes their receipt.
		const before = await as(PLAYER, 'select data from public.characters'); expect(before.rows[0].data).toEqual({});
		const key = `fight-damage:${PLAYER}:${offers[0].encounterId}`;
		await as(PLAYER, `update public.characters set data = jsonb_build_object('extra', jsonb_build_object('acceptedChanges', jsonb_build_object($1::text,true)))`, [key]);
		expect((await as(PLAYER, 'select public.campaign_damage_offers($1,$2) as offers', [VOYAGE,PLAYER])).rows[0].offers).toEqual([]);
		// Starting another fight does not bring an accepted result back.
		expect((await save(GM, newEncounter())).error).toBeNull();
		expect((await as(PLAYER, 'select public.campaign_damage_offers($1,$2) as offers', [VOYAGE,PLAYER])).rows[0].offers).toEqual([]);
	});
});
