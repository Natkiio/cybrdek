import { test, expect, type Page, type Route, type WebSocketRoute } from '@playwright/test';

import { findPlace, expectMapFillsViewport, openLayers, closeLayers } from './map-helpers.ts';

// GM pins and district edits on /map (#39). Supabase is faked for the whole
// test, so nothing touches the live database and no email is ever sent.
const REF = 'hntlvhspyllaaidvxlox';
const topaz = {
	id: 'e-topaz',
	slug: 'topazs-bar',
	title: "Topaz's Bar",
	type: 'location',
	summary: 'Neon dive bar in Central Point.',
	body: '',
	visible: true,
	created_at: '',
	updated_at: ''
};

interface Fake {
	isGm: boolean;
	pins: Record<string, unknown>[];
	posted: Record<string, unknown>[];
	districtWrites: Record<string, unknown>[];
}

async function fakeSupabase(page: Page, fake: Fake) {
	await page.context().route(/supabase\.co/, async (route: Route) => {
		const req = route.request();
		const url = new URL(req.url());
		const json = (body: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		if (url.pathname.endsWith('/rpc/is_campaign_gm')) return json(fake.isGm);
		if (url.pathname.endsWith('/lore_entries')) return json([topaz]);
		if (url.pathname.endsWith('/map_districts')) {
			if (req.method() === 'GET') return json([]);
			fake.districtWrites.push(JSON.parse(req.postData() ?? '{}'));
			return json([], 201);
		}
		if (url.pathname.endsWith('/map_pins')) {
			if (req.method() === 'GET') return json(fake.pins);
			const id = url.searchParams.get('id')?.replace('eq.', '');
			if (req.method() === 'DELETE') { fake.pins = fake.pins.filter(p => p.id !== id); return route.fulfill({ status: 204 }); }
			const row = { id: id ?? `p${fake.posted.length + 1}`, ...JSON.parse(req.postData() ?? '{}') };
			fake.posted.push(row);
			fake.pins = [...fake.pins.filter(p => p.id !== row.id), row];
			return json(row, 201); // .single() asks for one object
		}
		return json({});
	});
	const sockets: { ws: WebSocketRoute; join: string; topic: string; id: number }[] = [];
	await page.context().routeWebSocket(/supabase\.co/, ws => {
		ws.onMessage(message => {
			const [join, ref, topic, event, payload] = JSON.parse(String(message));
			if (event === 'phx_join') {
				const filters = (payload.config.postgres_changes ?? []).map((f: { table: string }, i: number) => ({ ...f, id: i + 1 }));
				const pins = filters.find((f: { table: string }) => f.table === 'map_pins');
				if (pins) sockets.push({ ws, join, topic, id: pins.id });
				ws.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]));
			} else if (event === 'heartbeat') ws.send(JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
		});
	});
	return {
		connected: () => sockets.length > 0,
		emit: () => { for (const s of sockets) s.ws.send(JSON.stringify([s.join, null, s.topic, 'postgres_changes', { ids: [s.id], data: {
			schema: 'public', table: 'map_pins', type: 'UPDATE', commit_timestamp: new Date().toISOString(), columns: [], record: {}, old_record: {}, errors: null
		} }])); }
	};
}

/** A signed-in session as supabase-js stores it, so no real login is needed. */
async function signedInAs(page: Page, email: string) {
	await page.addInitScript(
		({ ref, email }) => {
			const now = Math.floor(Date.now() / 1000);
			localStorage.setItem(
				`sb-${ref}-auth-token`,
				JSON.stringify({
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					token_type: 'bearer',
					expires_in: 3600,
					expires_at: now + 3600,
					user: { id: 'u1', aud: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '' }
				})
			);
		},
		{ ref: REF, email }
	);
}

async function tapMapAt(page: Page, fx: number, fy: number) {
	const box = (await page.getByRole('application', { name: 'Voyage City interactive map' }).boundingBox())!;
	await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test('the GM drops a pin, links it to lore and shows it to players', async ({ page }) => {
	const fake: Fake = { isGm: true, pins: [], posted: [], districtWrites: [] };
	await fakeSupabase(page, fake);
	await signedInAs(page, 'gm@example.com');
	await page.goto('/map');
	await expect(page.getByRole('link', { name: 'GM MODE' })).toBeVisible();

	await page.getByRole('button', { name: '+ PIN' }).click();
	await expect(page.getByText('TAP THE MAP…', { exact: true })).toBeVisible();
	await tapMapAt(page, 0.5, 0.5);
	await expect(page.getByText('NEW PIN')).toBeVisible();

	await page.getByLabel('LORE ENTRY').selectOption({ label: "Topaz's Bar · Location" });
	await expect(page.getByLabel('NAME')).toHaveValue("Topaz's Bar"); // named after the entry
	await page.getByLabel('VISIBLE TO PLAYERS').check();
	await page.getByRole('button', { name: 'SAVE PIN' }).click();

	await expect.poll(() => fake.posted.length).toBe(1);
	expect(fake.posted[0]).toMatchObject({ label: "Topaz's Bar", lore_entry_id: 'e-topaz', visible: true });
	const { x, y } = fake.posted[0] as { x: number; y: number };
	expect(x).toBeGreaterThan(0);
	expect(x).toBeLessThan(3840);
	expect(y).toBeGreaterThan(0);
	expect(y).toBeLessThan(2160);
	await expect(page.getByLabel('Selected place')).toContainText("Topaz's Bar");
	await expect(page.locator('g.pin')).toHaveCount(1);
	if (process.env.MAP_SCREENSHOT) await page.screenshot({ path: process.env.MAP_SCREENSHOT, fullPage: true });
});

test('the GM renames a district; a tap while not placing still selects districts', async ({ page }) => {
	const fake: Fake = { isGm: true, pins: [], posted: [], districtWrites: [] };
	await fakeSupabase(page, fake);
	await signedInAs(page, 'gm@example.com');
	await page.goto('/map');
	await expect(page.getByRole('link', { name: 'GM MODE' })).toBeVisible();

	await findPlace(page, 'Akiba');
	await page.getByRole('button', { name: 'EDIT DISTRICT', exact: true }).click();
	await page.getByLabel('NAME ON THE MAP').fill('Araki');
	await page.getByRole('button', { name: 'SAVE DISTRICT' }).click();
	await expect.poll(() => fake.districtWrites.length).toBe(1);
	expect(fake.districtWrites[0]).toMatchObject({ district_id: 'akiba', name: 'Araki', lore_entry_id: null });
	await page.getByRole('button', { name: 'Close District details' }).click();
	await expect(page.getByLabel('Selected district')).toContainText('Araki');
	if (process.env.MAP_SCREENSHOT) await page.screenshot({ path: process.env.MAP_SCREENSHOT.replace('.png', '-list.png'), fullPage: true });
});

test('players see pins and lore links, but no GM tools', async ({ page }) => {
	const fake: Fake = {
		isGm: false,
		pins: [{ id: 'p1', x: 2900, y: 900, label: "Topaz's Bar", lore_entry_id: 'e-topaz', visible: true, category: 'bar' }],
		posted: [],
		districtWrites: []
	};
	await fakeSupabase(page, fake);
	await page.goto('/map');
	await expect(page.locator('g.pin')).toHaveCount(1);
	await expect(page.getByRole('button', { name: '+ PIN' })).toHaveCount(0);

	await findPlace(page, "Topaz's Bar");
	await expect(page.getByText('Neon dive bar in Central Point.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'READ LORE →' })).toHaveAttribute('href', '/lore/topazs-bar');
	await expect(page.getByText('EDIT PIN')).toHaveCount(0);
});

test('tapping a district opens its wards, with each place under its ward', async ({ page }) => {
	const fake: Fake = {
		isGm: false,
		pins: [
			// Inside the Nova Peak ward of West Ridge.
			{ id: 'p1', x: 1070, y: 651, label: "Topaz's Bar", lore_entry_id: 'e-topaz', visible: true, category: 'bar' },
			// In West Ridge but outside every ward.
			{ id: 'p2', x: 1050, y: 390, label: 'Gecko’s flat', lore_entry_id: null, visible: true, category: 'home' },
			// In another district entirely: must not appear.
			{ id: 'p3', x: 3205, y: 210, label: 'Daynedale Diner', lore_entry_id: null, visible: true, category: 'food' }
		],
		posted: [],
		districtWrites: []
	};
	await fakeSupabase(page, fake);
	await page.goto('/map');
	await findPlace(page, 'West Ridge');

	const menu = page.getByRole('region', { name: 'West Ridge district' });
	await expect(menu.getByRole('heading', { name: 'West Ridge', exact: true })).toBeVisible();
	const nova = menu.locator('#ward-nova-peak');
	await expect(nova.getByRole('heading', { name: /Nova Peak/ })).toBeVisible();
	await expect(nova.getByRole('button', { name: /Bar \/ pub.*Topaz's Bar/ })).toBeVisible();
	await expect(nova.getByRole('link', { name: 'LORE →' })).toHaveAttribute('href', '/lore/topazs-bar');
	await expect(menu.getByRole('heading', { name: 'Elsewhere in West Ridge' })).toBeVisible();
	await expect(menu.getByRole('button', { name: /Home \(NPC\).*Gecko/ })).toBeVisible();
	await expect(menu.getByText('Daynedale Diner')).toHaveCount(0);

	// Tapping a ward opens its district's menu with that ward picked out.
	await findPlace(page, 'Nova Peak');
	await expect(page.getByRole('region', { name: 'West Ridge district' }).locator('#ward-nova-peak.focus')).toBeVisible();
	if (process.env.MAP_SCREENSHOT) await page.screenshot({ path: process.env.MAP_SCREENSHOT.replace('.png', '-menu.png'), fullPage: true });
});


for (const width of [390, 1280]) {
	for (const isGm of [false, true]) {
		test(`map-first layout, search, layers and selection at ${width}px as ${isGm ? 'GM' : 'player'}`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 844 });
			const errors: string[] = [];
			page.on('pageerror', e => errors.push(e.message));
			const fake: Fake = { isGm, pins: [
				{ id: 'public', x: 1070, y: 651, label: 'Public bar', visible: true, category: 'bar', lore_entry_id: null },
				{ id: 'secret', x: 1100, y: 700, label: 'Secret hideout', visible: false, category: 'home', lore_entry_id: null }
			], posted: [], districtWrites: [] };
			await fakeSupabase(page, fake);
			if (isGm) await signedInAs(page, 'gm@example.com');
			await page.goto('/map');
			await expect(page.locator('g.pin')).toHaveCount(isGm ? 2 : 1);
			await expectMapFillsViewport(page);
			await expect(page.locator('.map-page').getByRole('button')).toHaveCount(isGm ? 6 : 5);
			await expect(page.getByRole('dialog', { name: 'Layers', exact: true })).not.toBeVisible();
			await openLayers(page);
			await page.getByLabel('Places & pins').uncheck();
			await closeLayers(page);
			await expect(page.locator('g.pin')).toHaveCount(0);
			await openLayers(page);
			await page.getByLabel('Places & pins').check();
			await page.getByLabel('District outlines').check();
			await page.keyboard.press('Escape');
			await expect(page.getByRole('button', { name: 'LAYERS', exact: true })).toBeFocused();
			await expect(page.locator('polygon.outlined')).not.toHaveCount(0);
			await page.getByRole('button', { name: 'Find a place', exact: false }).click();
			const dialog = page.getByRole('dialog', { name: 'Find a place', exact: true });
			await expect(dialog.getByRole('searchbox')).toBeFocused();
			await expect(dialog.getByRole('button', { name: 'Secret hideout' })).toHaveCount(isGm ? 1 : 0);
			await dialog.getByRole('searchbox').fill('public');
			await dialog.getByRole('button', { name: 'Public bar', exact: true }).click();
			await expect(page.getByLabel('Selected place')).toContainText('Public bar');
			await expect(page.getByRole('button', { name: 'EDIT PIN', exact: true })).toHaveCount(isGm ? 1 : 0);
			await page.getByLabel('Close place card').click();
			await expect(page.getByLabel('Selected place')).toHaveCount(0);
			await findPlace(page, 'West Ridge');
			await expect(page.getByLabel('Selected district')).toBeVisible();
			await page.getByLabel('Close district menu').click();
			await expect(page.getByLabel('Selected district')).toHaveCount(0);
			await expectMapFillsViewport(page);
			await page.screenshot({ path: testInfo.outputPath(`map-${width}-${isGm ? 'gm' : 'player'}.png`) });
			expect(errors).toEqual([]);
		});
	}
}

test('the GM can move, save and delete a pin through the drawer', async ({ page }) => {
	const fake: Fake = { isGm: true, pins: [{ id: 'p1', x: 1070, y: 651, label: 'Move me', lore_entry_id: null, visible: false, category: 'other' }], posted: [], districtWrites: [] };
	await fakeSupabase(page, fake);
	await signedInAs(page, 'gm@example.com');
	await page.goto('/map');
	await findPlace(page, 'Move me');
	await page.getByRole('button', { name: 'EDIT PIN', exact: true }).click();
	await page.getByRole('button', { name: 'MOVE', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Pin details', exact: true })).not.toBeVisible();
	await expect(page.getByText('TAP TO MOVE PIN', { exact: true })).toBeVisible();
	await tapMapAt(page, 0.5, 0.3);
	await expect(page.getByLabel('NAME', { exact: true })).toHaveValue('Move me');
	await page.getByRole('button', { name: 'SAVE PIN' }).click();
	await expect.poll(() => fake.posted.length).toBe(1);
	expect(fake.posted[0].id).toBe('p1');
	expect(fake.posted[0].y).not.toBe(651);
	await page.getByRole('button', { name: 'EDIT PIN', exact: true }).click();
	await page.getByRole('button', { name: 'DELETE', exact: true }).click();
	await page.getByRole('button', { name: 'CONFIRM DELETE', exact: true }).click();
	await expect(page.locator('g.pin')).toHaveCount(0);
	await expect(page.getByLabel('Selected place')).toHaveCount(0);
});

test('a live pin notification refetches authorized rows and updates an open place card', async ({ page }) => {
	const fake: Fake = { isGm: false, pins: [{ id: 'p1', x: 1070, y: 651, label: 'Live place', lore_entry_id: null, visible: true, category: 'other' }], posted: [], districtWrites: [] };
	const realtime = await fakeSupabase(page, fake);
	await page.goto('/map');
	await expect.poll(realtime.connected).toBe(true);
	await findPlace(page, 'Live place');
	fake.pins[0].label = 'Updated place';
	realtime.emit();
	await expect(page.getByLabel('Selected place')).toContainText('Updated place');
	fake.pins = [];
	realtime.emit();
	await expect(page.locator('g.pin')).toHaveCount(0);
	await expect(page.getByLabel('Selected place')).toHaveCount(0);
});
