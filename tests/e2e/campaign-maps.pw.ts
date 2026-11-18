import { test, expect, type Page, type Route } from '@playwright/test';

// A campaign's own maps (#62). Supabase, including Storage, is faked; who may
// do what is tested on real Postgres in tests/db/campaign-maps.test.ts.
const REF = 'hntlvhspyllaaidvxlox';
const GAME = 'c0000000-0000-4000-8000-000000000002';

interface MapRow {
	id: string;
	name: string;
	width: number;
	height: number;
	active: boolean;
	uploaded_by?: string | null;
}

interface Fake {
	maps: MapRow[];
	files: Map<string, { type: string; body: Buffer }>;
	pinInserts: Record<string, unknown>[];
	calls: string[];
	offline: boolean;
	playersUpload?: boolean;
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
		if (path.endsWith('/rpc/can_upload_map')) return json(role === 'gm' || !!fake.playersUpload);
		if (path.endsWith('/rest/v1/campaigns') && url.searchParams.get('select') === 'players_upload_maps') {
			return json({ players_upload_maps: !!fake.playersUpload });
		}
		if (path.endsWith('/rest/v1/campaigns') && req.method() === 'PATCH') {
			fake.playersUpload = JSON.parse(req.postData() ?? '{}').players_upload_maps;
			fake.calls.push(`players-upload ${fake.playersUpload}`);
			return route.fulfill({ status: 204 });
		}
		if (path.endsWith('/rest/v1/campaign_maps')) {
			if (req.method() === 'POST') {
				const body = JSON.parse(req.postData() ?? '{}');
				const row = { id: crypto.randomUUID(), name: body.name, width: body.width, height: body.height, active: false, uploaded_by: 'u1' };
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
			return json(fake.maps);
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
			return json([]);
		}
		if (path.endsWith('/campaign_members')) return json([{ campaign_id: GAME, role }]);
		if (path.endsWith('/campaigns')) return json([{ id: GAME, name: 'Home Game', is_public: false }]);
		return json(path.includes('/auth/') ? {} : []);
	});
	await page.addInitScript(
		([ref, game]) => {
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

test('the GM uploads a map: shrunk to two WebP copies, shown to players at once, pins land on it', async ({ page }) => {
	const fake = fresh();
	await setup(page, 'gm', fake);
	await page.goto('/map');
	await expect(page.getByText('Upload a map below.')).toBeVisible();
	await uploadAs(page, 'The Docks', 6000, 3000);
	await expect(page.getByRole('heading', { name: 'The Docks' })).toBeVisible();

	expect(fake.calls).toEqual(['insert-map', 'upload full', 'upload small', 'activate']);
	expect(fake.maps).toEqual([expect.objectContaining({ name: 'The Docks', width: 4096, height: 2048, active: true })]);
	for (const size of ['full', 'small']) {
		const file = [...fake.files].find(([key]) => key.endsWith(`/${size}`))!;
		expect(file[0]).toMatch(new RegExp(`^${GAME}/[0-9a-f-]{36}/${size}$`));
		// supabase-js sends a multipart form; the image part carries its own type.
		const sent = file[1].body.toString('latin1');
		expect(sent).toMatch(/Content-Type: image\/webp/i);
		expect(sent).toMatch(/RIFF....WEBP/s);
	}
	await expect(page.locator('.scene img')).toHaveAttribute('src', /^blob:/);

	await page.getByRole('button', { name: '+ PIN' }).click();
	const box = (await page.locator('.scene img').boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByText('NEW PIN')).toBeVisible();
	await page.getByLabel('NAME', { exact: true }).fill('Pier 9');
	await page.getByRole('button', { name: 'SAVE PIN' }).click();
	await expect.poll(() => fake.pinInserts.length).toBe(1);
	expect(fake.pinInserts[0]).toMatchObject({ map_id: fake.maps[0].id, campaign_id: GAME });
	expect(fake.pinInserts[0].x as number).toBeLessThanOrEqual(4096);
});

test('a player sees the active map and no MAPS panel; with no map, a plain note', async ({ page }) => {
	const fake = fresh();
	await setup(page, 'player', fake);
	await page.goto('/map');
	await expect(page.getByText("Your GM hasn't added a map to this campaign yet.")).toBeVisible();
	await expect(page.getByText('UPLOAD MAP')).toHaveCount(0);

	// The GM adds one (faked straight into the cloud) and the player reloads.
	const png = await pngOf(page, 400, 200);
	fake.maps.push({ id: '11111111-1111-4111-8111-111111111111', name: 'Rooftops', width: 400, height: 200, active: true });
	for (const size of ['full', 'small']) fake.files.set(`${GAME}/11111111-1111-4111-8111-111111111111/${size}`, { type: 'image/png', body: png });
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Rooftops' })).toBeVisible();
	await expect(page.locator('.scene img')).toHaveAttribute('src', /^blob:/);
	await expect(page.getByRole('button', { name: '+ PIN' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'UPLOAD MAP' })).toHaveCount(0);
});

test('once seen, the active map still opens with no connection', async ({ page }) => {
	const fake = fresh();
	await setup(page, 'player', fake);
	await page.goto('/rules');
	const png = await pngOf(page, 400, 200);
	fake.maps.push({ id: '22222222-2222-4222-8222-222222222222', name: 'Night Market', width: 400, height: 200, active: true });
	for (const size of ['full', 'small']) fake.files.set(`${GAME}/22222222-2222-4222-8222-222222222222/${size}`, { type: 'image/png', body: png });
	await page.goto('/map');
	await expect(page.locator('.scene img')).toHaveAttribute('src', /^blob:/);

	fake.offline = true;
	await page.goto('/rules');
	await page.goto('/map');
	await expect(page.getByRole('heading', { name: 'Night Market' })).toBeVisible();
	await expect(page.locator('.scene img')).toHaveAttribute('src', /^blob:/);
	await expect(page.getByText('could not load')).toHaveCount(0);
});

test('deleting asks twice, removes the images before the map, and needs no browser pop-up', async ({ page }) => {
	const fake = fresh();
	await setup(page, 'gm', fake);
	await page.goto('/map');
	await uploadAs(page, 'Old Map', 300, 300);
	await expect(page.getByRole('heading', { name: 'Old Map' })).toBeVisible();
	fake.calls = [];
	const panel = page.locator('section.panel').filter({ hasText: 'MAPS' }).last();
	await panel.getByRole('button', { name: 'DELETE' }).click();
	expect(fake.calls).toEqual([]);
	await panel.getByRole('button', { name: 'YES, DELETE IT AND ITS PINS' }).click();
	await expect(page.getByText('Upload a map below.')).toBeVisible();
	expect(fake.calls).toEqual(['remove-files', 'delete-map']);
	expect(fake.files.size).toBe(0);
});

test('a non-image file is refused before anything is sent', async ({ page }) => {
	const fake = fresh();
	await setup(page, 'gm', fake);
	await page.goto('/map');
	const panel = page.locator('section.panel').filter({ hasText: 'MAPS' }).last();
	await panel.getByLabel('Map name').fill('Notes');
	await panel.getByLabel('Map image').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
	await panel.getByRole('button', { name: 'UPLOAD MAP' }).click();
	await expect(panel.getByRole('alert')).toContainText('Choose an image file');
	expect(fake.calls).toEqual([]);
});

test('the GM lets players upload; a player adds a map, can remove it, and leaves showing it to the GM', async ({ page }) => {
	const fake = fresh();
	await setup(page, 'gm', fake);
	await page.goto('/map');
	await expect(page.getByText('PLAYERS CAN UPLOAD MAPS: NO')).toBeVisible();
	await page.getByRole('button', { name: 'LET PLAYERS UPLOAD' }).click();
	await expect(page.getByText('PLAYERS CAN UPLOAD MAPS: YES')).toBeVisible();
	expect(fake.calls).toContain('players-upload true');

	await page.context().unrouteAll({ behavior: 'ignoreErrors' });
	await setup(page, 'player', fake);
	await page.reload();
	await expect(page.getByText('PLAYERS CAN UPLOAD MAPS')).toHaveCount(0);
	await uploadAs(page, 'Found a map', 400, 200);
	const panel = page.locator('section.panel').filter({ hasText: 'MAPS' }).last();
	await expect(panel.getByText('Found a map')).toBeVisible();
	await expect(panel.getByText('YOURS')).toBeVisible();
	expect(fake.calls).not.toContain('activate'); // the GM chooses what the table sees
	await expect(panel.getByRole('button', { name: 'SHOW THIS ONE' })).toHaveCount(0);
	await expect(panel.getByRole('button', { name: 'RENAME' })).toHaveCount(0);
	await panel.getByRole('button', { name: 'DELETE' }).click();
	await panel.getByRole('button', { name: /YES, DELETE/ }).click();
	await expect(panel.getByText('Found a map')).toHaveCount(0);
	expect(fake.calls.slice(-2)).toEqual(['remove-files', 'delete-map']);
});
