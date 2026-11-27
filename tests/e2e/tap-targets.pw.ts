import { test, expect } from '@playwright/test';

// #101 quick wins: the nav puts CAMPAIGNS after HOME, and the controls the
// layout audit measured are at least 44px tall.
test.beforeEach(async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
});

test('the nav reads HOME, CAMPAIGNS, CHARACTERS', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	const links = page.getByRole('navigation').first().getByRole('link');
	const labels = (await links.allTextContents()).map((t) => t.trim()).filter((t) => /^[A-Z]+$/.test(t));
	expect(labels.slice(0, 3)).toEqual(['HOME', 'CAMPAIGNS', 'CHARACTERS']);
});

test('the main reference link and the lore filters are 44px tap targets', async ({ page }) => {
	await page.goto('/rules');
	const link = page.getByRole('link', { name: 'NET RULES QUICK REFERENCE →' });
	expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await page.goto('/lore');
	const filter = page.getByRole('group', { name: 'Filter by type' }).getByRole('button').first();
	expect((await filter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('on the roster OPEN is the main action, apart from export, rename and delete', async ({ page }) => {
	await page.goto('/characters');
	await expect(page.getByRole('heading', { name: 'CHARACTERS' })).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					new Promise<boolean>((resolve) => {
						const req = indexedDB.open('cybrdek');
						req.onsuccess = () => {
							if (!req.result.objectStoreNames.contains('characters')) return resolve(false);
							const tx = req.result.transaction('characters', 'readwrite');
							tx.objectStore('characters').put({ id: 'r1', name: 'Rook', rulesetId: 'cyberpunk-red', stats: {}, skills: {}, extra: { role: 'tech' }, updatedAt: Date.now() });
							tx.oncomplete = () => resolve(true);
						};
					})
			)
		)
		.toBe(true);
	await page.reload();
	const open = page.getByRole('link', { name: 'OPEN', exact: true });
	const del = page.getByRole('button', { name: 'DELETE' });
	const o = (await open.boundingBox())!;
	const d = (await del.boundingBox())!;
	expect(o.height).toBeGreaterThanOrEqual(44);
	expect(d.y).toBeGreaterThan(o.y + o.height - 1); // on a phone, OPEN has its own row above the rest
	expect(await open.evaluate((a) => getComputedStyle(a).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
});
