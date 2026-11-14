import { test, expect, type Browser, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { newEncounter, spOf, type Encounter, type Combatant } from '../../src/lib/combat/encounter.ts';
import { woundState } from '../../src/lib/rulesets/red/wounds.ts';
const GAME = 'c0000000-0000-4000-8000-000000000002';
const GM = '10000000-0000-4000-8000-000000000001';
const PLAYER = '10000000-0000-4000-8000-000000000002';
const OTHER = '10000000-0000-4000-8000-000000000003';
const AUTH_KEY = 'sb-hntlvhspyllaaidvxlox-auth-token';
const sheet = (name: string) => ({ id: 'same-backup', name, rulesetId: 'cyberpunk-red',
	stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 },
	skills: {}, extra: { role: 'solo', roleRank: 4 } });

class Cloud {
	sheets = new Map([[PLAYER, { id: 'same-backup', data: sheet('Vex'), updated_at: 1000, deleted_at: null }],
		[OTHER, { id: 'same-backup', data: sheet('Kit'), updated_at: 1000, deleted_at: null }]]);
	sheetWrites: { who: string; body: any }[] = [];
	fight: { id: string; revision: number; ended: boolean; encounter: Encounter } | null = null;
	member = true;
	reads: { who: string; body: unknown }[] = [];
	requests: { who: string; path: string }[] = [];
	writes: { who: string; body: any }[] = [];
	sockets: { ws: WebSocketRoute; join: string; topic: string; table: string }[] = [];
	view(who: string) {
		const f = this.fight ?? { id: null, revision: 0, ended: false, encounter: newEncounter() };
		if (who === GM) return { ...f, canManage: true };
		return { ...f, canManage: false, encounter: { started: f.encounter.started, round: f.encounter.round,
			currentId: f.encounter.currentId, combatants: f.encounter.combatants.map(c => ({
				id: c.id, name: c.name, side: c.characterOwnerId ? 'pc' : 'npc',
				wound: c.dead ? 'dead' : woundState(c.hp, c.maxHp),
				...(c.characterOwnerId === who ? { characterId: c.characterId, hp: c.hp, maxHp: c.maxHp, sp: spOf(c) } : {})
			})) } };
	}
	emit() {
		for (const s of this.sockets.filter(s => s.table === 'campaign_encounter_updates')) {
			s.ws.send(JSON.stringify([s.join, null, s.topic, 'postgres_changes', { ids: [1], data: {
				schema: 'public', table: s.table, type: 'UPDATE', commit_timestamp: new Date().toISOString(),
				columns: [], record: { campaign_id: GAME, revision: this.fight?.revision ?? 0 }, old_record: {}, errors: null
			} }]));
		}
	}
	async device(browser: Browser, baseURL: string | undefined, who: string) {
		const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
		await context.route(/supabase\.co/, async route => {
			const req = route.request(); const url = new URL(req.url()); const body = JSON.parse(req.postData() ?? '{}');
			const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
			this.requests.push({ who, path: url.pathname });
			if (url.pathname.endsWith('/rpc/is_campaign_gm')) return json(who === GM);
			if (url.pathname.endsWith('/rpc/is_campaign_member')) return json(this.member || who === GM);
			if (url.pathname.endsWith('/rpc/campaign_encounter_view')) {
				if ((!this.member && who !== GM) || body.owner !== who) return json({ code: '42501', message: 'Not a member' }, 403);
				const view = this.view(who); this.reads.push({ who, body: view }); return json(view);
			}
			if (url.pathname.endsWith('/rpc/save_campaign_encounter')) {
				this.writes.push({ who, body });
				if (who !== GM || body.owner !== who) return json({ code: '42501', message: 'GM only' }, 403);
				if (body.fight_id && (body.fight_id !== this.fight?.id || body.expected_revision !== this.fight.revision)) return json({ code: '40001', message: 'Conflict' }, 409);
				for (const c of body.snapshot.combatants) c.startingHp = (this.fight?.encounter.combatants.find(old => old.id === c.id) as any)?.startingHp ?? c.hp;
				this.fight = { id: body.fight_id ?? '20000000-0000-4000-8000-000000000001', revision: (this.fight?.revision ?? 0) + 1,
					ended: body.finish, encounter: body.snapshot };
				this.emit(); return json(this.view(who));
			}
			if (url.pathname.endsWith('/rpc/my_characters')) return json(this.sheets.has(who) ? [this.sheets.get(who)] : []);
			if (url.pathname.endsWith('/rpc/save_character')) {
				this.sheetWrites.push({ who, body });
				if (body.owner !== who) return json({ message: 'Owner only' }, 403);
				this.sheets.set(who, { id: body.character_id, data: body.character_data, updated_at: body.saved_at, deleted_at: body.removed_at });
				return json(body.saved_at);
			}
			if (url.pathname.endsWith('/rpc/campaign_damage_offers')) {
				if ((!this.member && who !== GM) || body.owner !== who) return json({ message: 'Owner only' }, 403);
				const f = this.fight;
				const receipts = (this.sheets.get(who)?.data.extra as any)?.acceptedChanges ?? {};
				return json(!f?.ended ? [] : f.encounter.combatants.filter(c => c.characterOwnerId === who)
					.map(c => ({ encounterId: f.id, characterId: c.characterId, name: c.name,
						damage: Math.max(0, (c as any).startingHp - c.hp), endedAt: new Date().toISOString() }))
					.filter(o => o.damage > 0 && !receipts[`fight-damage:${who}:${f.id}`]));
			}
			if (url.pathname.endsWith('/characters')) return json(who === GM ? [
				{ user_id: PLAYER, id: 'same-backup', data: sheet('Vex') },
				{ user_id: OTHER, id: 'same-backup', data: sheet('Kit') }
			] : []);
			if (url.pathname.endsWith('/campaign_rolls')) return json([
				{ id: 'r1', user_id: PLAYER, roller_name: 'Vex', label: 'Shared Handgun roll', kind: 'skill', rolled_at: new Date().toISOString(), result: { rolls: [7], modifier: 8, total: 15 }, hidden: false }
			]);
			return json([]);
		});
		await context.routeWebSocket(/supabase\.co/, ws => {
			ws.onMessage(message => {
				const [join, ref, topic, event, payload] = JSON.parse(String(message));
				if (event === 'phx_join') {
					const filters = payload.config.postgres_changes;
					for (const filter of filters) this.sockets.push({ ws, join, topic, table: filter.table });
					ws.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters.map((f: object) => ({ ...f, id: 1 })) } }]));
				} else if (event === 'heartbeat') ws.send(JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
			});
			ws.onClose(() => { this.sockets = this.sockets.filter(s => s.ws !== ws); });
		});
		await context.addInitScript(([key, id, game]) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.setItem('cybrdek:campaign', JSON.stringify({ id: game, name: 'Friend Game' }));
			localStorage.setItem(key, JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh', token_type: 'bearer',
				expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: { id, aud: 'authenticated', email: 'member@example.com', app_metadata: {}, user_metadata: {}, created_at: '' } }));
		}, [AUTH_KEY, who, GAME]);
		return { context, page: await context.newPage() };
	}
}
const fightPanel = (page: import('@playwright/test').Page) => page.locator('section.panel').filter({ hasText: 'THE FIGHT · READ ONLY' });

test('GM runs a campaign fight; a second session sees only server-redacted updates and shared rolls', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	const gm = await cloud.device(browser, baseURL, GM); const player = await cloud.device(browser, baseURL, PLAYER);
	try {
		await gm.page.goto('/combat'); await player.page.goto('/combat');
		await expect(player.page.getByText('Shared Handgun roll')).toBeVisible();
		await expect.poll(() => cloud.sockets.filter(s => s.table === 'campaign_encounter_updates').length).toBe(2);
		await gm.page.getByRole('button', { name: 'NEW ENCOUNTER' }).click();
		await gm.page.getByRole('button', { name: '+ Vex', exact: true }).click();
		await expect(fightPanel(player.page).getByText('Vex', { exact: true })).toBeVisible();
		await gm.page.getByRole('button', { name: '+ Kit', exact: true }).click(); // same id, different owner
		await expect(fightPanel(player.page).getByText('Kit', { exact: true })).toBeVisible();
		await gm.page.getByLabel('NPC NAME').fill('Secret NPC');
		await gm.page.getByLabel('REF', { exact: true }).fill('17');
		await gm.page.getByLabel('HP', { exact: true }).fill('137');
		await gm.page.getByLabel('SP BODY').fill('23');
		await gm.page.getByRole('button', { name: 'ADD NPC' }).click();
		await expect(fightPanel(player.page).getByText('Secret NPC', { exact: true })).toBeVisible();
		for (const [name, init] of [['Secret NPC', '20'], ['Vex', '12'], ['Kit', '10']]) {
			await gm.page.getByLabel(`Initiative for ${name}`).fill(init); await gm.page.getByLabel(`Initiative for ${name}`).blur();
			await expect.poll(() => cloud.fight?.encounter.combatants.find(c => c.name === name)?.initiative).toBe(Number(init));
		}
		await gm.page.getByRole('button', { name: 'START FIGHT' }).click();
		await expect(fightPanel(player.page)).toContainText('ROUND 1');
		await gm.page.getByRole('button', { name: 'NEXT TURN →' }).click();
		await expect(fightPanel(player.page).locator('li.current')).toContainText('Vex');
		await gm.page.locator('li.card').filter({ hasText: 'Vex' }).getByRole('button', { name: /Vex/ }).click();
		await gm.page.getByLabel('Amount for Vex').fill('5');
		await gm.page.getByLabel('Hit location for Vex').selectOption('direct');
		await gm.page.locator('li.card').filter({ hasText: 'Vex' }).getByRole('button', { name: 'DAMAGE', exact: true }).click();
		await expect(fightPanel(player.page)).toContainText('YOUR CHARACTER · HP 35/40 · SP 0/0');
		const body = cloud.reads.filter(r => r.who === PLAYER).at(-1)!.body as any;
		const enemy = body.encounter.combatants.find((c: any) => c.name === 'Secret NPC');
		const teammate = body.encounter.combatants.find((c: any) => c.name === 'Kit');
		expect(Object.keys(enemy).sort()).toEqual(['id','name','side','wound']);
		expect(Object.keys(teammate).sort()).toEqual(['id','name','side','wound']);
		await expect(player.page.getByRole('button', { name: /NEW ENCOUNTER|ADD NPC|START FIGHT|DAMAGE|MARK DEAD|NEXT TURN/ })).toHaveCount(0);
		expect(cloud.requests.filter(r => r.who === PLAYER && /\/characters$|\/campaign_encounters$/.test(r.path))).toEqual([]);
		expect(cloud.writes.every(w => w.who === GM)).toBe(true);
		expect(await player.page.evaluate(() => localStorage.getItem('cybrdek:encounter'))).toBeNull();
		await gm.page.getByRole('button', { name: 'END ENCOUNTER', exact: true }).click();
		await gm.page.getByRole('button', { name: 'CONFIRM: END ENCOUNTER' }).click();
		await expect(player.page.getByRole('status').filter({ hasText: 'ENCOUNTER ENDED' })).toBeVisible();
		await expect(fightPanel(player.page)).toContainText('HP 35/40');
		await expect(player.page.getByRole('button', { name: 'Take 5 damage from the fight', exact: true })).toBeVisible();
		expect((cloud.sheets.get(PLAYER)!.data.extra as any).currentHp).toBeUndefined();
		expect(cloud.sheetWrites).toEqual([]);
	} finally { await gm.context.close(); await player.context.close(); }
});

test('membership revocation clears the fight; signing out restores an independent device tracker', async ({ browser, baseURL }) => {
	const cloud = new Cloud(); cloud.fight = { id: 'fight', revision: 1, ended: false,
		encounter: { ...newEncounter(), combatants: [{ id: 'npc', name: 'Private campaign enemy', ref: 19, hp: 90, maxHp: 99, tiebreak: 0, initiative: null, roll: null, gear: [], out: false }] } };
	const player = await cloud.device(browser, baseURL, PLAYER);
	try {
		await player.page.goto('/combat'); await expect(player.page.getByText('Private campaign enemy')).toBeVisible();
		cloud.member = false; cloud.emit();
		await expect(player.page.getByText('Private campaign enemy')).toHaveCount(0);
		await expect(player.page.getByRole('alert')).toContainText('membership');
		await player.page.getByRole('link', { name: 'SIGNED IN', exact: true }).click();
		await player.page.getByRole('button', { name: 'SIGN OUT' }).click();
		await player.page.getByRole('link', { name: 'COMBAT', exact: true }).click();
		await expect(player.page.getByLabel('NPC NAME')).toBeVisible();
		await expect(player.page.getByText('Private campaign enemy')).toHaveCount(0);
	} finally { await player.context.close(); }
});

// The server fixture emits only the owner's allowlisted offer. The real browser
// must apply it to IndexedDB and sync it as that owner, never from the GM.
test('finished damage waits for owner consent; receipt sync prevents a second-device repeat', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.fight = { id: '20000000-0000-4000-8000-000000000001', revision: 2, ended: true,
		encounter: { ...newEncounter(), combatants: [{ id: 'pc', name: 'Vex', characterId: 'same-backup', characterOwnerId: PLAYER,
			ref: 7, hp: 28, maxHp: 40, startingHp: 40, tiebreak: 0, initiative: null, roll: null, gear: [], out: false } as Combatant] } };
	const player = await cloud.device(browser, baseURL, PLAYER);
	const hp = async (context: BrowserContext) => context.pages()[0].evaluate(async () => {
		if (!(await indexedDB.databases()).some(db => db.name === 'cybrdek')) return undefined;
		return new Promise<any>((resolve, reject) => {
			const request = indexedDB.open('cybrdek'); request.onerror = () => reject(request.error);
			request.onsuccess = () => { const db = request.result; if (!db.objectStoreNames.contains('characters')) { db.close(); return resolve(undefined); } const read = db.transaction('characters').objectStore('characters').get('same-backup');
				read.onsuccess = () => { resolve(read.result); db.close(); }; read.onerror = () => reject(read.error); };
		});
	});
	try {
		await player.page.goto('/combat');
		const take = player.page.getByRole('button', { name: 'Take 12 damage from the fight', exact: true });
		await expect(take).toBeVisible();
		expect((await hp(player.context)).extra.currentHp).toBeUndefined(); // default full HP
		expect(cloud.sheetWrites).toHaveLength(0);
		await player.context.setOffline(true);
		await take.click();
		await expect(player.page.getByRole('status').filter({ hasText: 'Applied 12 damage' })).toBeVisible();
		expect((await hp(player.context)).extra.currentHp).toBe(28);
		expect((await hp(player.context)).dirty).toBe(true);
		await player.context.setOffline(false);
		await expect.poll(() => (cloud.sheets.get(PLAYER)!.data.extra as any).currentHp).toBe(28);
		expect(cloud.sheetWrites.every(w => w.who === PLAYER && w.body.owner === PLAYER)).toBe(true);
		const second = await cloud.device(browser, baseURL, PLAYER);
		try {
			await second.page.goto('/combat');
			await expect.poll(async () => (await hp(second.context))?.extra.currentHp).toBe(28);
			await expect(second.page.getByRole('button', { name: /Take .* damage from the fight/ })).toHaveCount(0);
		} finally { await second.context.close(); }
		await player.page.reload();
		await expect(player.page.getByText('THE FIGHT · READ ONLY')).toBeVisible();
		await expect(take).toHaveCount(0); expect((await hp(player.context)).extra.currentHp).toBe(28);
	} finally { await player.context.close(); }
});
