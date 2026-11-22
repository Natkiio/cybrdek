import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { SUPABASE_DEFAULT_GRANTS } from '../db/supabase-defaults.ts';
import { newEncounter, makeNpc } from '../../src/lib/combat/encounter.ts';
import { runnerNet, securityCombatant } from '../../src/lib/rulesets/red/net-combat.ts';
import { newDeck } from '../../src/lib/rulesets/red/cyberdeck.ts';
const CAMPAIGN = '00000000-0000-4000-8000-000000000001';
const GM = '10000000-0000-4000-8000-000000000001';
const PLAYER = '10000000-0000-4000-8000-000000000002';
const db = new PGlite();
let queue = Promise.resolve();
// Real SQL under real API roles. Serialize transactions across browser contexts.
async function rpc(user: string, sql: string, params: unknown[]) {
	let resolve!: (value: { data?: unknown; code?: string }) => void;
	const result = new Promise<{ data?: unknown; code?: string }>((r) => (resolve = r));
	queue = queue.then(async () => {
		await db.exec('begin; set local role authenticated;');
		try {
			await db.query("select set_config('test.uid',$1,true)", [user]);
			const { rows } = await db.query<{ v: unknown }>(sql, params);
			await db.exec('commit');
			resolve({ data: rows[0]?.v });
		} catch (e) {
			await db.exec('rollback');
			resolve({ code: (e as { code: string }).code });
		}
	});
	await queue;
	return result;
}
test.beforeAll(async () => {
	await db.exec(`create role anon; create role authenticated; create schema auth;
 grant usage on schema auth, public to anon, authenticated;
 create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
 grant execute on all functions in schema auth to anon,authenticated;
 insert into auth.users(id,email) values ('${GM}','gm@example.com'),('${PLAYER}','player@example.com');`);
	await db.exec(SUPABASE_DEFAULT_GRANTS);
	for (const file of readdirSync('supabase/migrations').sort()) {
		if (file.includes('_campaigns'))
			await db.exec("insert into public.gms(email) values('gm@example.com')");
		await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
	}
	await db.exec(
		`insert into public.campaign_members(campaign_id,user_id,role) values('${CAMPAIGN}','${PLAYER}','player')`
	);
});
test.afterAll(async () => {
	await queue;
	await db.close();
});
test.beforeEach(async () => {
	await queue;
	await db.exec(
		'delete from public.campaign_encounters; delete from public.campaign_encounter_updates;'
	);
});
async function connect(context: BrowserContext, user: string) {
	await context.addInitScript(
		({ user }) => {
			if (sessionStorage.getItem('net-seeded')) return;
			sessionStorage.setItem('net-seeded', '1');
			localStorage.setItem(
				'sb-hntlvhspyllaaidvxlox-auth-token',
				JSON.stringify({
					access_token: `token-${user}`,
					refresh_token: 'refresh',
					token_type: 'bearer',
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					user: {
						id: user,
						email: user.includes('000001') ? 'gm@example.com' : 'player@example.com',
						aud: 'authenticated',
						app_metadata: {},
						user_metadata: {},
						created_at: ''
					}
				})
			);
		},
		{ user }
	);
	await context.route(/supabase\.co/, async (route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname;
		const body = JSON.parse(req.postData() ?? '{}');
		const json = (data: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
		let result: { data?: unknown; code?: string };
		if (path.endsWith('/rpc/campaign_encounter_view'))
			result = await rpc(user, 'select public.campaign_encounter_view($1,$2) as v', [
				body.campaign,
				body.owner
			]);
		else if (path.endsWith('/rpc/save_campaign_encounter'))
			result = await rpc(user, 'select public.save_campaign_encounter($1,$2,$3,$4,$5,$6) as v', [
				body.campaign,
				body.owner,
				body.fight_id,
				body.expected_revision,
				JSON.stringify(body.snapshot),
				body.finish
			]);
		else if (path.endsWith('/rpc/campaign_damage_offers'))
			result = await rpc(user, 'select public.campaign_damage_offers($1,$2) as v', [
				body.campaign,
				body.owner
			]);
		else if (path.endsWith('/rpc/is_campaign_gm'))
			result = await rpc(user, 'select public.is_campaign_gm($1) as v', [body.campaign]);
		else if (path.endsWith('/rpc/is_gm')) return json(false);
		else return json([]);
		return result.code ? json({ code: result.code, message: 'Rejected' }, 400) : json(result.data);
	});
}
async function fixture() {
	await db.exec(
		`insert into public.characters(user_id,id,data,updated_at,campaign_id) values('${PLAYER}','runner-sheet','{}',1000,'${CAMPAIGN}') on conflict(user_id,id) do nothing`
	);
	const runner = makeNpc('runner', { name: 'Runner', ref: 8, hp: 40, spHead: 11, spBody: 11 });
	runner.initiative = 14;
	runner.gear = [
		{
			id: 'deck',
			kind: 'item',
			name: 'Runner deck',
			cyberdeck: {
				...newDeck(),
				programs: ['sword', 'armor'].map((defId, i) => ({ id: `copy-${i}`, defId, loaded: true }))
			}
		}
	];
	runner.net = runnerNet(runner.gear[0], 4);
	runner.characterOwnerId = PLAYER;
	runner.characterId = 'runner-sheet';
	const guard = makeNpc('guard', { name: 'Guard', ref: 6, hp: 30, spHead: 0, spBody: 7 });
	guard.initiative = 8;
	const ice = securityCombatant('ice', 'ice', 'hellhound');
	const result = await rpc(
		GM,
		'select public.save_campaign_encounter($1,$2,null,0,$3,false) as v',
		[CAMPAIGN, GM, JSON.stringify({ ...newEncounter(), combatants: [runner, guard, ice] })]
	);
	expect(result.code).toBeUndefined();
}
test('NET and meatspace share a persisted GM fight, with real SQL redaction for players', async ({
	page,
	browser
}, info) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await fixture();
	await connect(page.context(), GM);
	await page.addInitScript(() => (Math.random = () => 0.5));
	await page.goto('/combat');
	await page.getByRole('button', { name: 'START FIGHT', exact: true }).click();
	const net = page
		.locator('section.panel')
		.filter({ has: page.getByText('NET COMBAT', { exact: true }) });
	await expect(page.getByText('Up now:')).toContainText('ICE · Hellhound');
	await net.getByLabel(/^NET target/).selectOption('runner');
	await net.getByRole('button', { name: 'ENCOUNTER / SPEED CONTEST' }).click();
	await expect(net.getByRole('region', { name: 'NET state Runner' })).toContainText('32 HP');
	await net.getByRole('button', { name: 'RESOLVE NET ATTACK' }).click();
	await expect(net.getByRole('region', { name: 'NET state Runner' })).toContainText('24 HP');
	await page.getByRole('button', { name: 'NEXT TURN →' }).click();
	await expect(page.getByText('Up now:')).toContainText('Runner');
	await net.getByLabel(/^NET target/).selectOption('ice');
	await net.getByLabel(/^Attack\s/).selectOption('copy-0');
	await net.getByRole('button', { name: 'RESOLVE NET ATTACK' }).click();
	await expect(net.getByRole('region', { name: 'NET state ICE · Hellhound' })).toContainText(
		'8 REZ'
	);
	await net.getByRole('button', { name: 'RESOLVE NET ATTACK' }).click();
	await expect(net.getByRole('alert')).toContainText('available Attacker');
	await net
		.getByRole('region', { name: 'NET state Runner' })
		.getByRole('button', { name: 'ACTIVATE', exact: true })
		.click();
	await expect(net.getByRole('region', { name: 'NET state Runner' })).toContainText(
		'7 REZ · active'
	);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: info.outputPath('net-combat-mobile.png'), fullPage: true });
	await page.reload();
	await expect(net.getByRole('region', { name: 'NET state ICE · Hellhound' })).toContainText(
		'8 REZ'
	);
	await expect(net.getByRole('region', { name: 'NET state Runner' })).toContainText(
		'7 REZ · active'
	);
	const context = await browser.newContext();
	await connect(context, PLAYER);
	const player = await context.newPage();
	const response = player.waitForResponse((r) => r.url().includes('/rpc/campaign_encounter_view'));
	await player.goto('/combat');
	const payload = await (await response).json();
	expect(JSON.stringify(payload)).not.toMatch(/"net":|hardware|targetId|activatedRound|savedPhase/);
	expect(payload.encounter.combatants.find((c: any) => c.id === 'ice')).not.toHaveProperty(
		'netStatus'
	);
	await expect(player.getByText('YOUR NET SNAPSHOT', { exact: false })).toBeVisible();
	await expect(player.getByText('Armor · 7 REZ · active', { exact: true })).toBeVisible();
	await expect(player.getByText('ICE · Hellhound', { exact: true })).toBeVisible();
	await expect(player.getByText('NET COMBAT', { exact: true })).toHaveCount(0);
	await expect(player.getByRole('button', { name: 'RESOLVE NET ATTACK' })).toHaveCount(0);
	await context.close();
	expect(errors).toEqual([]);
});
test('GM can create NPC runners and security from the combat UI before starting a fight', async ({
	page
}) => {
	await connect(page.context(), GM);
	await page.goto('/combat');
	await page.getByRole('button', { name: 'NEW ENCOUNTER', exact: true }).click();
	const net = page
		.locator('section.panel')
		.filter({ has: page.getByText('NET COMBAT', { exact: true }) });
	await net.getByText('ADD NPC NETRUNNER', { exact: true }).click();
	await net.getByLabel('NPC runner name').fill('Enemy');
	await net.getByRole('button', { name: 'ADD NPC RUNNER', exact: true }).click();
	await net.getByLabel('Security kind').selectOption('demon');
	await net.getByRole('button', { name: 'ADD NET SECURITY', exact: true }).click();
	await page.getByRole('button', { name: 'START FIGHT', exact: true }).click();
	await expect(page.getByText('Up now:')).toContainText('DEMON · Imp');
	await net.getByLabel(/^NET target/).selectOption({ label: 'Enemy' });
	await net.getByRole('button', { name: 'OPERATE CONTROL NODE (NET ACTION)' }).click();
	await expect(net).toContainText('NET actions spent 1');
});
