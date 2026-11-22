import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { SUPABASE_DEFAULT_GRANTS } from './supabase-defaults.ts';
import { newArchitecture, newFloor, newEntry } from '../../src/lib/net/architecture.ts';
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


const snapshot = () => ({ ...newArchitecture(), name: 'Server vault', gmNotes: 'Architecture secret', secret: 'root-extra-secret', floors: [
 { ...newFloor('entrance','Entrance'), revealed: true, gmNotes: 'Floor secret', extra: 'floor-extra-secret', entries: [
  { ...newEntry('pw','password'), dv: 8, playerText: 'A locked door', gmNotes: 'Password is swordfish', answer: 'entry-extra-secret' },
  { ...newEntry('ice','black-ice'), refId: 'hellhound', name: 'Hellhound' }
 ] },
 { ...newFloor('hidden','SECRET LOWER FLOOR'), gmNotes: 'Hidden notes', entries: [{ ...newEntry('file','file'), playerText: 'Secret file contents' }] }
] });
const view = (user: string | null, campaign = VOYAGE) => as(user,'select public.campaign_net_architectures($1) as v',[campaign]);
const save = (user: string | null, state: unknown, id: string | null = null, revision: number | null = 0, campaign = VOYAGE) => as(user,
 'select public.save_net_architecture($1,$2,$3,$4) as v',[campaign,id,revision,JSON.stringify(state)]);
const remove = (user: string | null, id: string, revision: number | null, campaign = VOYAGE) => as(user,
 'select public.delete_net_architecture($1,$2,$3) as v',[campaign,id,revision]);
let id = '';
let revision = 1;
it('API roles have no raw table access, helper execution or invalidation writes', async () => {
 for (const user of [GM,PLAYER,RIVAL,null]) {
  for (const sql of ['select * from public.net_architectures','delete from public.net_architectures',
   'update public.net_architectures set revision=99',"insert into public.net_architectures(campaign_id,state) values ('"+VOYAGE+"','{}')",
   'delete from public.net_architecture_updates','update public.net_architecture_updates set revision=99',
   "select public.validate_net_architecture('{}')"]) expect((await as(user,sql)).error).toBe('42501');
 }
});
it('only the selected campaign GM can create; entirely hidden Architectures stay invisible', async () => {
 for (const user of [PLAYER,RIVAL,null]) expect((await save(user,snapshot())).error).toBe('42501');
 const made = await save(GM,snapshot()); expect(made.error).toBeNull();
 id = (made.rows[0].v as any).architectures[0].id;
 expect((made.rows[0].v as any).canManage).toBe(true);
 expect((await save(GM,{ ...newArchitecture(), name: 'UNREVEALED ARCHITECTURE' })).error).toBeNull();
 const p = (await view(PLAYER)).rows[0].v as any;
 expect(p.architectures).toHaveLength(1);
 expect(JSON.stringify(p)).not.toContain('UNREVEALED ARCHITECTURE');
});
it('the player view allowlists every level, removing all hidden content and arbitrary extra fields', async () => {
 const gm = (await view(GM)).rows[0].v as any;
 expect(JSON.stringify(gm)).toContain('Architecture secret');
 const p = (await view(PLAYER)).rows[0].v as any;
 expect(p.canManage).toBe(false);
 expect(Object.keys(p.architectures[0]).sort()).toEqual(['floors','id','name','revision']);
 expect(p.architectures[0].floors).toHaveLength(1);
 const f = p.architectures[0].floors[0];
 expect(Object.keys(f).sort()).toEqual(['entries','id','label']);
 expect(Object.keys(f.entries[0]).sort()).toEqual(['dv','id','name','playerText','refId','type']);
 expect(f.entries[0]).toMatchObject({ dv: 8, playerText: 'A locked door' });
 expect(f.entries[1].refId).toBe('hellhound');
 expect(JSON.stringify(p)).not.toMatch(/secret|SECRET|swordfish|gmNotes|revealed|Secret file/);
});
it('public spectators, anonymous users, foreign campaigns and GMs of another table get nothing', async () => {
 for (const user of [RIVAL,null]) expect((await view(user)).error).toBe('42501');
 expect((await view(PLAYER,rivalCampaign)).error).toBe('42501');
 expect((await as(RIVAL,'select * from public.net_architecture_updates')).rows).toEqual([]);
 expect((await as(PLAYER,'select * from public.net_architecture_updates')).rows).toEqual([{ campaign_id: VOYAGE, revision: 2 }]);
 for (const user of [PLAYER,RIVAL,null]) {
  expect((await save(user,snapshot(),id,1)).error).toBe('42501');
  expect((await remove(user,id,1)).error).toBe('42501');
 }
 expect((await save(RIVAL,snapshot(),id,1,rivalCampaign)).error).toBe('40001');
 expect((await remove(RIVAL,id,1,rivalCampaign)).error).toBe('40001');
});
it('reveal and hide are server-enforced; stale edits cannot resurrect a hidden floor', async () => {
 const next = snapshot(); next.floors[1].revealed = true;
 expect((await save(GM,next,id,revision++)).error).toBeNull();
 expect(((await view(PLAYER)).rows[0].v as any).architectures[0].floors).toHaveLength(2);
 next.floors[0].revealed = false;
 expect((await save(GM,next,id,revision++)).error).toBeNull();
 const player = (await view(PLAYER)).rows[0].v as any;
 expect(player.architectures[0].floors.map((f: any) => f.id)).toEqual(['hidden']);
 expect((await save(GM,snapshot(),id,1)).error).toBe('40001');
 expect((await save(GM,snapshot(),id,null)).error).toBe('40001');
 expect((await remove(GM,id,1)).error).toBe('40001');
 next.floors[1].revealed = false;
 expect((await save(GM,next,id,revision++)).error).toBeNull();
 expect(((await view(PLAYER)).rows[0].v as any).architectures).toEqual([]);
});
it('validates structure, duplicate IDs, text limits, DVs and catalog references in Postgres', async () => {
 const variants: unknown[] = [null,{},[],{ ...snapshot(), name: '' },{ ...snapshot(), floors: null },{ ...snapshot(), gmNotes: false }];
 for (const patch of [{ id: 'entrance' },{ dv: -1 },{ dv: 1.5 },{ dv: '8' },{ dv: null, refId: 'imp' },{ type: 'unknown' },{ gmNotes: null },{ name: '' },{ playerText: 'x'.repeat(2001) }]) {
  const s = snapshot(); Object.assign(s.floors[0].entries[0],patch); variants.push(s);
 }
 for (const refId of ['missing','imp',null]) { const s = snapshot(); s.floors[0].entries[1].refId = refId as any; variants.push(s); }
 const duplicate = snapshot(); duplicate.floors.push(duplicate.floors[0]); variants.push(duplicate);
 const revealString = snapshot(); (revealString.floors[0] as any).revealed = 'true'; variants.push(revealString);
 for (const s of variants) expect((await save(GM,s,id,revision)).error).toBe('23514');
 const demon = snapshot(); demon.floors[1].entries.push(newEntry('demon','demon'));
 expect((await save(GM,demon,id,revision++)).error).toBeNull();
});
it('deletion is revision checked, notifications contain no content, membership revocation is immediate', async () => {
 expect((await remove(GM,id,revision)).error).toBeNull();
 expect((await remove(GM,id,revision)).error).toBe('40001');
 const signals = (await as(PLAYER,'select * from public.net_architecture_updates')).rows[0];
 expect(Object.keys(signals).sort()).toEqual(['campaign_id','revision']);
 await as(GM,'delete from public.campaign_members where campaign_id=$1 and user_id=$2',[VOYAGE,PLAYER]);
 expect((await view(PLAYER)).error).toBe('42501');
 expect((await as(PLAYER,'select * from public.net_architecture_updates')).rows).toEqual([]);
});
