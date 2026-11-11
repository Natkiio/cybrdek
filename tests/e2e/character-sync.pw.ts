import { test, expect, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';

// Character sync (#52) across two "devices": separate browser contexts with
// their own storage, sharing one fake cloud. The cloud's own privacy rules are
// tested on real Postgres in tests/db/characters.test.ts.
const REF = 'hntlvhspyllaaidvxlox';

const sheet = (id: string, name: string) => ({
	id,
	name,
	rulesetId: 'cyberpunk-red',
	stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 },
	skills: {},
	extra: { role: 'solo', roleRank: 4 }
});

interface Row {
	user: string;
	id: string;
	data: Record<string, unknown>;
	updated_at: number;
	deleted_at: number | null;
}

class Cloud {
	rows: Row[] = [];
	versions: { version_id: number; data: unknown; updated_at: number }[] = [];
	reads = 0;
	saves: string[] = [];
	of = (user: string, id: string) => this.rows.find((r) => r.user === user && r.id === id);
	put(user: string, id: string, name: string, at = Date.now(), deleted_at: number | null = null) {
		const row = this.of(user, id);
		if (row) Object.assign(row, { data: sheet(id, name), updated_at: at, deleted_at });
		else this.rows.push({ user, id, data: sheet(id, name), updated_at: at, deleted_at });
	}
}

async function device(browser: Browser, baseURL: string | undefined, cloud: Cloud, user?: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
	await context.route(/supabase\.co/, async (route: Route) => {
		const req = route.request();
		const url = new URL(req.url());
		const path = url.pathname;
		const who = req.headers().authorization?.match(/token-(\w+)/)?.[1];
		const json = (value: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
		// Like the real functions, both refuse a request for someone else's account.
		const forSomeoneElse = () => JSON.parse(req.postData() ?? '{}').owner !== who;
		if (path.endsWith('/rpc/my_characters')) {
			if (forSomeoneElse()) return json({ code: '42501', message: 'This list is for a different account.' }, 403);
			cloud.reads++;
			return json(cloud.rows.filter((r) => r.user === who).map(({ user: _u, ...row }) => row));
		}
		if (path.endsWith('/rpc/save_character')) {
			if (forSomeoneElse()) return json({ code: '42501', message: 'This save is for a different account.' }, 403);
			const body = JSON.parse(req.postData() ?? '{}');
			const existing = cloud.of(who ?? '', body.character_id);
			if (existing && body.saved_at < existing.updated_at) return json(null);
			if (existing) Object.assign(existing, { data: body.character_data, updated_at: body.saved_at, deleted_at: body.removed_at });
			else cloud.rows.push({ user: who ?? '', id: body.character_id, data: body.character_data, updated_at: body.saved_at, deleted_at: body.removed_at });
			cloud.saves.push(body.character_id);
			return json(body.saved_at);
		}
		if (path.endsWith('/rest/v1/character_versions')) return json(cloud.versions);
		if (path.endsWith('/rpc/is_campaign_gm')) return json(false);
		return json(path.includes('/auth/') ? {} : []);
	});
	if (user) {
		await context.addInitScript(
			([ref, id]) => {
				if (sessionStorage.getItem('test-signed-in')) return;
				sessionStorage.setItem('test-signed-in', '1');
				localStorage.setItem(
					`sb-${ref}-auth-token`,
					JSON.stringify({
						access_token: `token-${id}`,
						refresh_token: 'refresh',
						token_type: 'bearer',
						expires_in: 3600,
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						user: { id, aud: 'authenticated', email: `${id}@example.com`, app_metadata: {}, user_metadata: {}, created_at: '' }
					})
				);
			},
			[REF, user]
		);
	}
	return { context, page: await context.newPage() };
}

/** A character that exists only on this device. */
async function seedDeviceOnly(page: Page, id: string, name: string) {
	await page.evaluate(
		([character]) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('cybrdek');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('characters', 'readwrite');
					tx.objectStore('characters').put({ ...(character as object), updatedAt: Date.now() });
					tx.oncomplete = () => {
						open.result.close();
						resolve();
					};
				};
			}),
		[sheet(id, name)]
	);
}

const nudge = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online')));
const synced = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'SYNCED TO YOUR ACCOUNT' })).toBeVisible();

async function renameTo(page: Page, from: string, to: string) {
	const row = page.locator('.character-row').filter({ hasText: from });
	await row.getByRole('button', { name: 'RENAME' }).click();
	await page.getByLabel('HANDLE').fill(to);
	await page.getByRole('button', { name: 'SAVE' }).click();
	await expect(page.locator('.character-row').filter({ hasText: to })).toBeVisible();
}

test('a character follows the player to a second device, and an edit comes back', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Vex');
	const phone = await device(browser, baseURL, cloud, 'u1');
	const laptop = await device(browser, baseURL, cloud, 'u1');

	await phone.page.goto('/characters');
	await expect(phone.page.getByText('Vex')).toBeVisible();
	await laptop.page.goto('/characters');
	await expect(laptop.page.getByText('Vex')).toBeVisible();

	await renameTo(laptop.page, 'Vex', 'Vex Prime');
	await expect.poll(() => cloud.of('u1', 'v')?.data.name).toBe('Vex Prime');

	await nudge(phone.page);
	await expect(phone.page.getByText('Vex Prime')).toBeVisible();
	await phone.context.close();
	await laptop.context.close();
});

test("another player's characters never reach this device", async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Vex');
	const other = await device(browser, baseURL, cloud, 'u2');
	await other.page.goto('/characters');
	await synced(other.page);
	await expect(other.page.getByText('No characters on file.')).toBeVisible();
	await other.context.close();
});

test('edits made offline sync on reconnecting, and the sheet keeps working', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Vex');
	const { context, page } = await device(browser, baseURL, cloud, 'u1');
	await page.goto('/characters');
	await expect(page.getByText('Vex')).toBeVisible();
	await synced(page);

	await context.setOffline(true);
	await renameTo(page, 'Vex', 'Offline Vex');
	await expect(page.getByRole('status').filter({ hasText: 'OFFLINE' })).toBeVisible();
	expect(cloud.of('u1', 'v')?.data.name).toBe('Vex');

	await context.setOffline(false);
	await expect.poll(() => cloud.of('u1', 'v')?.data.name).toBe('Offline Vex');
	await context.close();
});

test('an open sheet shows a newer copy from another device, so it cannot save the old one back', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Vex');
	const { context, page } = await device(browser, baseURL, cloud, 'u1');
	await page.goto('/characters');
	await expect(page.getByText('Vex')).toBeVisible();
	await page.goto('/characters/v');
	await expect(page.getByRole('heading', { name: 'Vex' })).toBeVisible();

	cloud.put('u1', 'v', 'Changed Elsewhere', Date.now() + 1000);
	await nudge(page);
	await expect(page.getByRole('heading', { name: 'Changed Elsewhere' })).toBeVisible();
	await context.close();
});

test('deleting on one device removes it from the other', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Vex');
	const phone = await device(browser, baseURL, cloud, 'u1');
	const laptop = await device(browser, baseURL, cloud, 'u1');
	await phone.page.goto('/characters');
	await expect(phone.page.getByText('Vex')).toBeVisible();
	await laptop.page.goto('/characters');
	await expect(laptop.page.getByText('Vex')).toBeVisible();

	await laptop.page.getByRole('button', { name: 'DELETE' }).click();
	await laptop.page.getByRole('button', { name: 'YES' }).click();
	await expect.poll(() => cloud.of('u1', 'v')?.deleted_at).toBeTruthy();

	await nudge(phone.page);
	await expect(phone.page.getByText('No characters on file.')).toBeVisible();
	await phone.context.close();
	await laptop.context.close();
});

test('signing out takes account characters off the device; the cloud keeps them', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Vex');
	const { context, page } = await device(browser, baseURL, cloud, 'u1');
	await page.goto('/characters');
	await expect(page.getByText('Vex')).toBeVisible();
	await synced(page);
	await seedDeviceOnly(page, 'local', 'Device Only');

	await page.goto('/gm');
	await page.getByRole('button', { name: 'SIGN OUT' }).click();
	await expect(page.getByRole('button', { name: 'SIGN IN', exact: true })).toBeVisible();
	await page.goto('/characters');
	await expect(page.getByRole('heading', { name: 'Device Only' })).toBeVisible();
	await expect(page.getByText('Vex')).toHaveCount(0);
	// Actually gone from this device's storage, not just hidden on screen.
	const stored = () =>
		page.evaluate(
			() =>
				new Promise<string[]>((resolve, reject) => {
					const open = indexedDB.open('cybrdek');
					open.onerror = () => reject(open.error);
					open.onsuccess = () => {
						const all = open.result.transaction('characters').objectStore('characters').getAllKeys();
						all.onsuccess = () => {
							open.result.close();
							resolve(all.result as string[]);
						};
					};
				})
		);
	await expect.poll(stored).toEqual(['local']);
	expect(cloud.of('u1', 'v')).toBeTruthy();
	await context.close();
});

test('an older device-only character moves in only when the player chooses', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	const { context, page } = await device(browser, baseURL, cloud, 'u1');
	await page.goto('/characters');
	await synced(page);
	await seedDeviceOnly(page, 'old', 'Old Timer');
	await page.reload();
	await expect(page.getByText('Old Timer')).toBeVisible();
	await synced(page);
	expect(cloud.of('u1', 'old')).toBeUndefined();

	await page.getByRole('button', { name: 'MOVE TO MY ACCOUNT' }).click();
	await expect.poll(() => cloud.of('u1', 'old')?.data.name).toBe('Old Timer');
	await expect(page.getByRole('button', { name: 'MOVE TO MY ACCOUNT' })).toHaveCount(0);
	await context.close();
});

test('with no account nothing changes, and nothing is sent', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	const { context, page } = await device(browser, baseURL, cloud);
	await page.goto('/characters');
	await expect(page.getByText('No characters on file.')).toBeVisible();
	await seedDeviceOnly(page, 'solo', 'Solo Player');
	await page.reload();
	await expect(page.getByText('Solo Player')).toBeVisible();
	await expect(page.getByText('Saved on this device only.')).toBeVisible();
	await renameTo(page, 'Solo Player', 'Still Solo');
	await page.waitForTimeout(2000);
	expect(cloud.reads).toBe(0);
	expect(cloud.saves).toEqual([]);
	await context.close();
});

test('a damaged cloud copy is skipped, not opened', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Vex');
	cloud.rows.push({ user: 'u1', id: 'bad', data: { nonsense: true }, updated_at: 5, deleted_at: null });
	const { context, page } = await device(browser, baseURL, cloud, 'u1');
	await page.goto('/characters');
	await expect(page.getByText('Vex')).toBeVisible();
	await expect(page.getByText('1 saved character could not be read.')).toBeVisible();
	await expect(page.locator('.character-row')).toHaveCount(1);
	await context.close();
});

test('a past version can be brought back, and syncs as the newest', async ({ browser, baseURL }) => {
	const cloud = new Cloud();
	cloud.put('u1', 'v', 'Overwritten');
	cloud.versions = [{ version_id: 7, data: sheet('v', 'The Good One'), updated_at: 1000 }];
	const { context, page } = await device(browser, baseURL, cloud, 'u1');
	await page.goto('/characters');
	await expect(page.getByText('Overwritten')).toBeVisible();
	await page.goto('/characters/v');
	await page.getByRole('button', { name: 'SHOW PAST VERSIONS' }).click();
	await page.getByRole('button', { name: 'RESTORE' }).click();
	await page.getByRole('button', { name: 'CONFIRM RESTORE' }).click();
	await expect(page.getByRole('heading', { name: 'The Good One' })).toBeVisible();
	await expect.poll(() => cloud.of('u1', 'v')?.data.name).toBe('The Good One');
	await context.close();
});
