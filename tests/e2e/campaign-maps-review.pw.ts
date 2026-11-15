import { test, expect, type Page, type Route } from '@playwright/test';
import { goToSection } from './nav.ts';

// Campaign maps (#62): fixes from the review of #99, adapted from the reviewer's
// reproductions to assert the fixed behaviour. Supabase, including Storage, is faked.
test.use({ serviceWorkers: 'block' });
const REF = 'hntlvhspyllaaidvxlox';
const GAME = 'c0000000-0000-4000-8000-000000000002';

interface MapRow {
	id: string;
	name: string;
	width: number;
	height: number;
	active: boolean;
}

interface Fake {
	maps: MapRow[];
	files: Map<string, { type: string; body: Buffer }>;
	pinInserts: Record<string, unknown>[];
	calls: string[];
	offline: boolean;
 failRemove?: boolean;
 pins?: any[];
 pinUpdates?: any[];
 mapReads?: number;
}

async function setup(page: Page, role: 'gm' | 'player', fake: Fake) {
	await page.context().route(/supabase\.co/, async (route: Route) => {
		const req = route.request();
		const url = new URL(req.url());
		const path = url.pathname;
		const json = (value: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
		if (fake.offline && !path.includes('/auth/')) return route.abort('internetdisconnected');
		if (path.endsWith('/rpc/is_campaign_gm')) return json(role === 'gm');
		if (path.endsWith('/rest/v1/campaign_maps')) {
			if (req.method() === 'POST') {
				const body = JSON.parse(req.postData() ?? '{}');
				const row = { id: crypto.randomUUID(), name: body.name, width: body.width, height: body.height, active: false };
				fake.maps.push(row);
				fake.calls.push('insert-map');
				return json(row, 201);
			}
			if (req.method() === 'DELETE') {
				const id = url.searchParams.get('id')?.replace('eq.', '');
				fake.maps = fake.maps.filter((m) => m.id !== id);
				fake.calls.push('delete-map');
				return route.fulfill({ status: 204 });
			}
			fake.mapReads = (fake.mapReads ?? 0) + 1; return json(fake.maps);
		}
		if (path.endsWith('/rpc/set_active_map')) {
			const body = JSON.parse(req.postData() ?? '{}');
			fake.maps.forEach((m) => (m.active = m.id === body.map));
			fake.calls.push('activate');
			return json(null);
		}
		const storage = path.match(/\/storage\/v1\/object\/campaign-maps\/?(.*)$/);
		if (storage) {
			const key = decodeURIComponent(storage[1]);
			if (req.method() === 'POST' || req.method() === 'PUT') {
				fake.files.set(key, { type: req.headers()['content-type'] ?? '', body: req.postDataBuffer() ?? Buffer.alloc(0) });
				fake.calls.push(`upload ${key.split('/').pop()}`);
				return json({ Key: `campaign-maps/${key}` });
			}
			if (req.method() === 'DELETE') {
				if (fake.failRemove) { fake.calls.push('remove-files-failed'); return json({ error: 'InternalError', message: 'Storage temporarily unavailable' }, 500); }
				const { prefixes } = JSON.parse(req.postData() ?? '{}') as { prefixes: string[] };
				prefixes.forEach((p) => fake.files.delete(p));
				fake.calls.push('remove-files');
				return json([]);
			}
			const file = fake.files.get(key);
			if (!file) return json({ error: 'not found' }, 400);
			// Uploads arrive as a multipart form: hand back just the image inside it.
			const start = file.body.indexOf('RIFF');
			const body = file.type.startsWith('multipart') && start >= 0 ? file.body.subarray(start) : file.body;
			return route.fulfill({ status: 200, contentType: 'image/webp', body });
		}
		if (path.endsWith('/rest/v1/map_pins')) {
			if (req.method() === 'POST') {
				const body = JSON.parse(req.postData() ?? '{}');
				fake.pinInserts.push(body);
				return json({ id: 'pin-1', ...body }, 201);
			}
			if (req.method() === 'PATCH') {
 const id = url.searchParams.get('id')?.replace('eq.', ''); const body = JSON.parse(req.postData() ?? '{}');
 fake.pinUpdates?.push({ id, ...body });
 const pin = fake.pins?.find(p => p.id === id); Object.assign(pin ?? {}, body); return json(pin);
}
const id = url.searchParams.get('map_id')?.replace('eq.', ''); return json(fake.pins?.filter(p => p.map_id === id) ?? []);
		}
		if (path.endsWith('/campaign_members')) return json([{ campaign_id: GAME, role }]);
		if (path.endsWith('/campaigns')) return json([{ id: GAME, name: 'Home Game', is_public: false }]);
		return json(path.includes('/auth/') ? {} : []);
	});
	await page.addInitScript(
		([ref, game]) => {
 if (sessionStorage.getItem('review99-seeded')) return;
 sessionStorage.setItem('review99-seeded', '1');
			localStorage.setItem('cybrdek:campaign', JSON.stringify({ id: game, name: 'Home Game' }));
			localStorage.setItem(
				`sb-${ref}-auth-token`,
				JSON.stringify({
					access_token: 'test-token',
					refresh_token: 'refresh',
					token_type: 'bearer',
					expires_in: 3600,
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					user: { id: 'u1', aud: 'authenticated', email: 'someone@example.com', app_metadata: {}, user_metadata: {}, created_at: '' }
				})
			);
		},
		[REF, GAME]
	);
}

const fresh = (): Fake => ({ maps: [], files: new Map(), pinInserts: [], calls: [], offline: false });

/** A real PNG, drawn in the page, as the "photo" the GM picks. */
async function pngOf(page: Page, width: number, height: number): Promise<Buffer> {
	const dataUrl = await page.evaluate(
		([w, h]) => {
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const context = canvas.getContext('2d')!;
			context.fillStyle = '#204060';
			context.fillRect(0, 0, w, h);
			context.fillStyle = '#e0c040';
			context.fillRect(w / 4, h / 4, w / 2, h / 2);
			return canvas.toDataURL('image/png');
		},
		[width, height]
	);
	return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function uploadAs(page: Page, name: string, width: number, height: number) {
	const panel = page.locator('section.panel').filter({ hasText: 'MAPS' }).last();
	await panel.getByLabel('Map name').fill(name);
	await panel.getByLabel('Map image').setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: await pngOf(page, width, height) });
	await panel.getByRole('button', { name: 'UPLOAD MAP' }).click();
}



test("if the images can't be removed, the map is kept and the GM is told", async ({ page }) => {
	const fake = fresh();
	await setup(page, 'gm', fake);
	await page.goto('/map');
	await uploadAs(page, 'Keep files reachable', 300, 300);
	await expect(page.getByRole('heading', { name: 'Keep files reachable' })).toBeVisible();
	fake.calls = [];
	fake.failRemove = true;
	const panel = page.locator('section.panel').filter({ hasText: 'MAPS' }).last();
	await panel.getByRole('button', { name: 'DELETE', exact: true }).click();
	await panel.getByRole('button', { name: 'YES, DELETE IT AND ITS PINS' }).click();
	await expect(panel.getByRole('alert')).toContainText('could not be removed');
	expect(fake.calls).toEqual(['remove-files-failed']);
	expect(fake.maps).toHaveLength(1);
	expect(fake.files.size).toBe(2);
	await expect(page.getByRole('heading', { name: 'Keep files reachable' })).toBeVisible();
});

test("after signing out, a private campaign's map is gone from the device, even offline", async ({ page }) => {
	const fake = fresh();
	await setup(page, 'player', fake);
	await page.goto('/rules');
	const png = await pngOf(page, 400, 200);
	const id = '22222222-2222-4222-8222-222222222222';
	fake.maps.push({ id, name: 'PRIVATE GM FLOORPLAN', width: 400, height: 200, active: true });
	for (const size of ['full', 'small']) fake.files.set(`${GAME}/${id}/${size}`, { type: 'image/png', body: png });
	await page.goto('/map');
	await expect(page.getByRole('heading', { name: 'PRIVATE GM FLOORPLAN' })).toBeVisible();
	await page.getByRole('link', { name: 'SIGNED IN', exact: true }).click();
	fake.offline = true;
	await page.getByRole('button', { name: 'SIGN OUT', exact: true }).click();
	await expect(page.getByRole('link', { name: 'SIGN IN', exact: true })).toBeVisible();
	await goToSection(page, 'MAP');
	await page.waitForTimeout(500);
	await expect(page.getByText('PRIVATE GM FLOORPLAN')).toHaveCount(0);
	await expect(page.locator('.scene img')).toHaveCount(0);
	const leftovers = await page.evaluate(async () => ({
		keys: Object.keys(localStorage).filter((k) => k.startsWith('cybrdek:active-map:')),
		cached: (await caches.keys()).includes('cybrdek-campaign-maps')
	}));
	expect(leftovers).toEqual({ keys: [], cached: false });
});

test('showing another map closes the pin editor, so nothing is saved onto the wrong map', async ({ page }) => {
	const fake = fresh();
	fake.pins = [];
	fake.pinUpdates = [];
	await setup(page, 'gm', fake);
	await page.goto('/map');
	await uploadAs(page, 'Map A', 400, 200);
	await expect(page.getByRole('heading', { name: 'Map A' })).toBeVisible();
	const a = fake.maps[0].id;
	await uploadAs(page, 'Map B', 400, 200);
	await expect.poll(() => fake.maps.length).toBe(2);
	await expect(page.getByRole('button', { name: 'UPLOAD MAP', exact: true })).toBeEnabled();
	fake.pins = [{ id: 'old-pin', campaign_id: GAME, map_id: a, x: 100, y: 100, label: 'A secret location', lore_entry_id: null, visible: true, category: 'other' }];
	const manager = page.locator('section.panel').filter({ hasText: 'MAPS' }).last();
	await manager.locator('li').filter({ hasText: 'Map B' }).getByRole('button', { name: 'SHOW THIS ONE' }).click();
	await expect(page.getByRole('heading', { name: 'Map B' })).toBeVisible();
	await manager.locator('li').filter({ hasText: 'Map A' }).getByRole('button', { name: 'SHOW THIS ONE' }).click();
	await expect(page.getByRole('heading', { name: 'Map A' })).toBeVisible();
	await page.locator('details.places summary').click();
	await page.getByRole('button', { name: 'A secret location', exact: true }).click();
	await expect(page.getByText('EDIT PIN', { exact: true })).toBeVisible();
	await manager.locator('li').filter({ hasText: 'Map B' }).getByRole('button', { name: 'SHOW THIS ONE' }).click();
	await expect(page.getByRole('heading', { name: 'Map B' })).toBeVisible();
	await expect(page.getByText('EDIT PIN', { exact: true })).toHaveCount(0);
	await expect(page.getByText('A secret location')).toHaveCount(0);
	expect(fake.pinUpdates).toEqual([]);
});

test("reloading a remembered map loads it once and shows its pins", async ({ page }) => {
	const fake = fresh();
	fake.pins = [];
	await setup(page, 'gm', fake);
	await page.goto('/map');
	await uploadAs(page, 'Reload Map', 400, 200);
	await expect(page.getByRole('heading', { name: 'Reload Map' })).toBeVisible();
	fake.pins = [{ id: 'pin-on-reload', map_id: fake.maps[0].id, x: 100, y: 100, label: 'Must survive reload', lore_entry_id: null, visible: true, category: 'other' }];
	const before = fake.mapReads ?? 0;
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Reload Map' })).toBeVisible();
	await expect(page.locator('details.places')).toContainText('PLACES');
	await page.waitForTimeout(1000);
	expect((fake.mapReads ?? 0) - before).toBeLessThanOrEqual(3);
});
