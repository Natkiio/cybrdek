import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { SUPABASE_DEFAULT_GRANTS } from '../db/supabase-defaults.ts';
import { newArchitecture, newFloor, newEntry } from '../../src/lib/net/architecture.ts';
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
		`delete from public.net_architectures; delete from public.net_architecture_updates;
		insert into public.campaign_members(campaign_id,user_id,role) values('${CAMPAIGN}','${PLAYER}','player') on conflict do nothing;`
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
		if (path.endsWith('/rpc/campaign_net_architectures'))
			result = await rpc(user, 'select public.campaign_net_architectures($1) as v', [
				body.campaign
			]);
		else if (path.endsWith('/rpc/save_net_architecture'))
			result = await rpc(user, 'select public.save_net_architecture($1,$2,$3,$4) as v', [
				body.campaign,
				body.architecture_id,
				body.expected_revision,
				JSON.stringify(body.snapshot)
			]);
		else if (path.endsWith('/rpc/delete_net_architecture'))
			result = await rpc(user, 'select public.delete_net_architecture($1,$2,$3) as v', [
				body.campaign,
				body.architecture_id,
				body.expected_revision
			]);
		else if (path.endsWith('/rpc/is_campaign_gm'))
			result = await rpc(user, 'select public.is_campaign_gm($1) as v', [body.campaign]);
		else if (path.endsWith('/rpc/is_gm')) return json(false);
		else return json([]);
		return result.code ? json({ code: result.code, message: 'Rejected' }, 400) : json(result.data);
	});
}
async function open(page: Page) {
	await page.goto('/net');
	await expect(page.getByRole('heading', { name: 'NET ARCHITECTURES', exact: true })).toBeVisible();
	await expect(page.getByText('LOADING…', { exact: true })).toHaveCount(0);
}
async function fixture(revealed = true) {
	const a = {
		...newArchitecture(),
		name: 'Fixture',
		gmNotes: 'TOP SECRET',
		floors: [{ ...newFloor('f', 'Entry'), revealed, entries: [newEntry('e', 'password')] }]
	};
	const result = await rpc(GM, 'select public.save_net_architecture($1,null,0,$2) as v', [
		CAMPAIGN,
		JSON.stringify(a)
	]);
	expect(result.code).toBeUndefined();
}
test('GM builds multiple floors and entries; SQL sends only revealed floors to players, including after hide/reconnect', async ({
	page,
	browser
}, info) => {
	await connect(page.context(), GM);
	await open(page);
	await page.getByRole('button', { name: 'NEW ARCHITECTURE', exact: true }).click();
	await page.getByLabel('Architecture name').fill('Relay');
	await page.getByLabel('Architecture GM notes').fill('TOP SECRET ARCHITECTURE');
	await page.getByRole('button', { name: 'ADD FLOOR', exact: true }).click();
	const first = page.getByRole('region', { name: 'Edit floor 1', exact: true });
	await first.getByLabel('Floor label').fill('Entrance');
	await first.getByLabel('Floor GM notes').fill('TOP SECRET FLOOR');
	await first.getByRole('button', { name: 'ADD ENTRY', exact: true }).click();
	const password = first.getByRole('group', { name: 'password', exact: true });
	await password.getByLabel('Entry name').fill('Gate');
	await password.getByLabel('DV (optional)').fill('8');
	await password.getByLabel('Player text').fill('A locked gateway');
	await password.getByLabel('Entry GM notes').fill('TOP SECRET ANSWER');
	await first.getByLabel('Entry type').selectOption('black-ice');
	await first.getByRole('button', { name: 'ADD ENTRY', exact: true }).click();
	await first
		.getByRole('group', { name: 'black-ice', exact: true })
		.getByLabel('Security reference')
		.selectOption('hellhound');
	await expect(first).toContainText('PER 6 · SPD 6 · ATK 6 · DEF 2 · REZ 20');
	await page.getByRole('button', { name: 'ADD FLOOR', exact: true }).click();
	const second = page.getByRole('region', { name: 'Edit floor 2', exact: true });
	await second.getByLabel('Floor label').fill('Hidden vault');
	for (const type of ['file', 'control-node', 'demon']) {
		await second.getByLabel('Entry type').selectOption(type);
		await second.getByRole('button', { name: 'ADD ENTRY', exact: true }).click();
	}
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: info.outputPath('net-editor-mobile.png'), fullPage: true });
	await page.getByRole('button', { name: 'SAVE ARCHITECTURE', exact: true }).click();
	await expect(page.getByRole('button', { name: 'EDIT ARCHITECTURE', exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('region', { name: 'Relay', exact: true })).toBeVisible();
	const playerContext = await browser.newContext();
	await connect(playerContext, PLAYER);
	const runner = await playerContext.newPage();
	await open(runner);
	await expect(runner.getByText('No floors revealed yet.')).toBeVisible();
	await expect(runner.getByRole('button', { name: 'NEW ARCHITECTURE' })).toHaveCount(0);
	await page.getByRole('button', { name: 'REVEAL FLOOR: Entrance', exact: true }).click();
	const read = runner.waitForResponse((r) => r.url().includes('/rpc/campaign_net_architectures'));
	await runner.getByRole('button', { name: 'REFRESH ARCHITECTURES', exact: true }).click();
	const payload = await (await read).json();
	expect(JSON.stringify(payload)).not.toMatch(/TOP SECRET|gmNotes|Hidden vault|"dv"/);
	await expect(runner.getByRole('heading', { name: 'Entrance', exact: true })).toBeVisible();
	await expect(runner.getByText('A locked gateway')).toBeVisible();
	await expect(runner.getByText(/DV 8/)).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Relay', exact: true })).toContainText('DV 8');
	await expect(runner.getByText('Hidden vault', { exact: true })).toHaveCount(0);
	await expect(runner.getByRole('button', { name: 'EDIT ARCHITECTURE' })).toHaveCount(0);
	await playerContext.setOffline(true);
	await expect(runner.getByRole('region', { name: 'Relay', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'HIDE FLOOR: Entrance', exact: true }).click();
	await playerContext.setOffline(false);
	await runner.getByRole('button', { name: 'REFRESH ARCHITECTURES', exact: true }).click();
	await expect(runner.getByText('No floors revealed yet.')).toBeVisible();
	await playerContext.close();
});

test('stale GM draft cannot overwrite a newer reveal and the draft is retained for review', async ({
	page,
	browser
}) => {
	await fixture();
	await connect(page.context(), GM);
	await open(page);
	await page.getByRole('button', { name: 'EDIT ARCHITECTURE', exact: true }).click();
	await page.getByLabel('Architecture name').fill('Stale name');
	const otherContext = await browser.newContext();
	await connect(otherContext, GM);
	const other = await otherContext.newPage();
	await open(other);
	await other.getByRole('button', { name: 'HIDE FLOOR: Entry', exact: true }).click();
	await page.getByRole('button', { name: 'SAVE ARCHITECTURE', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('changed elsewhere');
	await expect(page.getByLabel('Architecture name')).toHaveValue('Stale name');
	const result = await rpc(PLAYER, 'select public.campaign_net_architectures($1) as v', [CAMPAIGN]);
	expect((result.data as any).architectures).toEqual([]);
	await page.getByRole('button', { name: 'CANCEL EDIT', exact: true }).click();
	await page.getByText('MANAGE ARCHITECTURE', { exact: true }).click();
	await page.getByRole('button', { name: 'DELETE ARCHITECTURE', exact: true }).click();
	await page.getByRole('button', { name: 'CONFIRM DELETE ARCHITECTURE', exact: true }).click();
	await expect(page.getByText('No Architectures saved yet.')).toBeVisible();
	await otherContext.close();
});

test('an open player view clears after campaign membership is revoked', async ({ page }) => {
	await fixture();
	await connect(page.context(), PLAYER);
	await open(page);
	await expect(page.getByRole('region', { name: 'Fixture', exact: true })).toBeVisible();
	const result = await rpc(
		GM,
		'delete from public.campaign_members where campaign_id=$1 and user_id=$2 returning true as v',
		[CAMPAIGN, PLAYER]
	);
	expect(result.code).toBeUndefined();
	await page.getByRole('button', { name: 'REFRESH ARCHITECTURES', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('membership');
	await expect(page.getByRole('region', { name: 'Fixture', exact: true })).toHaveCount(0);
});


async function layoutFixture() {
	const ice = { ...newEntry('ice', 'black-ice'), name: 'Hellhound', refId: 'hellhound' };
	const a = { ...newArchitecture(), name: 'Relay HQ', gmNotes: '   ', floors: [
		{ ...newFloor('hidden', 'Hidden vault'), gmNotes: '   ', entries: [newEntry('secret', 'file')] },
		{ ...newFloor('security', 'Security'), revealed: true, entries: [ice, { ...newEntry('gate', 'password'), dv: 8, playerText: 'A locked gateway' }] },
		{ ...newFloor('archive', 'Archive'), revealed: true, gmNotes: 'Keep this note', entries: [{ ...newEntry('data', 'file'), gmNotes: 'Private entry note' }] }
	] };
	const result = await rpc(GM, 'select public.save_net_architecture($1,null,0,$2) as v', [CAMPAIGN, JSON.stringify(a)]);
	expect(result.code).toBeUndefined();
}

for (const width of [390, 1280]) {
	for (const user of [GM, PLAYER]) {
		test(`Architecture layout at ${width}px as ${user === GM ? 'GM' : 'player'}`, async ({ page }, info) => {
			await layoutFixture();
			await connect(page.context(), user);
			await page.setViewportSize({ width, height: 900 });
			const errors: string[] = [];
			page.on('pageerror', e => errors.push(e.message));
			await open(page);
			const architecture = page.getByRole('region', { name: 'Relay HQ', exact: true });
			await expect(architecture.getByRole('heading', { name: 'Relay HQ', exact: true })).toBeVisible();
			const index = architecture.getByRole('navigation');
			if (width >= 1000) {
				await expect(index).toBeVisible();
				await expect(index.getByRole('link')).toHaveCount(user === GM ? 3 : 2);
				await index.getByRole('link', { name: /Archive/ }).click();
				await expect(architecture.locator('.floor').last()).toBeFocused();
				expect((await architecture.locator('.floor').last().boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('header.bar').boundingBox())!.height);
			} else await expect(index).not.toBeVisible();
			if (user === GM) {
				await expect(architecture.getByText('2 / 3 floors revealed', { exact: true })).toBeVisible();
				await expect(architecture.locator('.notes')).toHaveCount(2);
				await expect(architecture.getByText('GM notes: Keep this note', { exact: true })).toBeVisible();
				const visibility = architecture.getByRole('group', { name: 'Visibility of Hidden vault', exact: true });
				await expect(visibility.locator('.badge')).toHaveText('HIDDEN');
				await expect(visibility.getByRole('button', { name: 'REVEAL FLOOR: Hidden vault', exact: true })).toBeVisible();
				await expect(architecture.getByRole('button', { name: 'DELETE ARCHITECTURE', exact: true })).not.toBeVisible();
				await expect(architecture.getByRole('button', { name: 'EDIT ARCHITECTURE', exact: true })).toBeVisible();
			} else {
				await expect(architecture.getByText('2 revealed floors', { exact: true })).toBeVisible();
				await expect(architecture.locator('.floor .number')).toHaveText(['REVEALED FLOOR 01', 'REVEALED FLOOR 02']);
				await expect(architecture.getByText('Hidden vault', { exact: true })).toHaveCount(0);
				await expect(architecture.locator('.notes')).toHaveCount(0);
				await expect(architecture.getByText(/DV 8/)).toHaveCount(0);
				await expect(architecture.getByText('MANAGE ARCHITECTURE', { exact: true })).toHaveCount(0);
				await expect(architecture.getByRole('button')).toHaveCount(0);
			}
			const stats = architecture.getByRole('group', { name: 'Hellhound stats', exact: true });
			await expect(stats.locator('dt')).toHaveText(['PER', 'SPD', 'ATK', 'DEF', 'REZ']);
			await expect(stats.locator('dd')).toHaveText(['6', '6', '6', '2', '20']);
			const values = await stats.locator('dd').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().y));
			expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1);
			for (const button of await architecture.getByRole('button').all()) {
				if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.screenshot({ path: info.outputPath(`net-${width}-${user === GM ? 'gm' : 'player'}.png`), fullPage: true });
			expect(errors).toEqual([]);
		});
	}
}

test('laptop floor index follows the editor draft; reveal and delete stay separate', async ({ page }) => {
	await layoutFixture();
	await connect(page.context(), GM);
	await page.setViewportSize({ width: 1280, height: 900 });
	await open(page);
	const architecture = page.getByRole('region', { name: 'Relay HQ', exact: true });
	const visibility = architecture.getByRole('group', { name: 'Visibility of Hidden vault', exact: true });
	await visibility.getByRole('button', { name: 'REVEAL FLOOR: Hidden vault' }).click();
	await expect(visibility.locator('.badge')).toHaveText('REVEALED');
	await expect(architecture.getByText('3 / 3 floors revealed', { exact: true })).toBeVisible();
	await architecture.getByRole('button', { name: 'EDIT ARCHITECTURE', exact: true }).click();
	const editor = page.getByRole('group', { name: 'ARCHITECTURE EDITOR', exact: true });
	const index = editor.getByRole('navigation');
	await index.getByRole('link', { name: /Archive/ }).click();
	const third = editor.getByRole('region', { name: 'Edit floor 3', exact: true });
	await expect(third).toBeFocused();
	await third.getByLabel('Floor label', { exact: true }).fill('Archive renamed');
	await third.getByRole('button', { name: 'MOVE UP', exact: true }).click();
	await expect(index.getByRole('link')).toHaveText([/01.*Hidden vault.*REVEALED/s, /02.*Archive renamed.*REVEALED/s, /03.*Security.*REVEALED/s]);
	await page.getByRole('button', { name: 'CANCEL EDIT', exact: true }).click();
	await architecture.getByText('MANAGE ARCHITECTURE', { exact: true }).click();
	await architecture.getByRole('button', { name: 'DELETE ARCHITECTURE', exact: true }).click();
	await expect(architecture.getByRole('button', { name: 'CONFIRM DELETE ARCHITECTURE', exact: true })).toBeVisible();
	await architecture.getByRole('button', { name: 'KEEP ARCHITECTURE', exact: true }).click();
	await expect(architecture).toBeVisible();
	await expect(architecture.getByRole('button', { name: 'CONFIRM DELETE ARCHITECTURE', exact: true })).toHaveCount(0);
});


test('long Architecture, floor and entry names stay inside the phone and laptop layouts', async ({ page }) => {
	const a = { ...newArchitecture(), name: 'W'.repeat(100), floors: [{ ...newFloor('floor', 'M'.repeat(100)), entries: [{ ...newEntry('entry', 'file'), name: 'W'.repeat(100) }] }] };
	const result = await rpc(GM, 'select public.save_net_architecture($1,null,0,$2) as v', [CAMPAIGN, JSON.stringify(a)]);
	expect(result.code).toBeUndefined();
	await connect(page.context(), GM);
	await open(page);
	for (const width of [390, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await page.evaluate(() => document.fonts.ready);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.getByRole('button', { name: 'EDIT ARCHITECTURE', exact: true }).click();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.getByRole('button', { name: 'CANCEL EDIT', exact: true }).click();
	}
});
