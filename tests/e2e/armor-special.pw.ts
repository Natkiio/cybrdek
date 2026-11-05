import { test, expect, type Page } from '@playwright/test';

async function saved(page: Page) {
	return page.evaluate(() => new Promise<{ extra: { currentHp: number; gear: { currentSp?: { body?: number; head?: number } }[] } }>((resolve) => {
		const request = indexedDB.open('cybrdek');
		request.onsuccess = () => {
			const db = request.result;
			const read = db.transaction('characters').objectStore('characters').get('armor-special');
			read.onsuccess = () => { db.close(); resolve(read.result); };
		};
	}));
}

test('damage form: default, melee, brawling, AP, rubber, stun and direct HP', async ({ page }, testInfo) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/characters');
	await page.evaluate(async () => new Promise<void>((resolve, reject) => {
		const request = indexedDB.open('cybrdek');
		request.onupgradeneeded = () => request.result.createObjectStore('characters', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const db = request.result;
			const tx = db.transaction('characters', 'readwrite');
			tx.objectStore('characters').put({ id: 'armor-special', name: 'Armor Test', rulesetId: 'cyberpunk-red', stats: Object.fromEntries(['INT','REF','DEX','TECH','COOL','WILL','LUCK','MOVE','BODY','EMP'].map((id) => [id, 6])), skills: {}, extra: { currentHp: 40, criticalInjuries: [{ location: 'head', roll: 9 }], gear: [{ id: 'suit', name: 'Bodyweight Suit', kind: 'armor', location: 'both', sp: 11 }] }, updatedAt: Date.now() });
			tx.oncomplete = () => { db.close(); resolve(); };
			tx.onerror = () => reject(tx.error);
		};
	}));
	await page.goto('/characters/armor-special');
	await expect(page.getByRole('heading', { name: 'Armor Test' })).toBeVisible();
	const attack = page.getByLabel('Attack type', { exact: true });
	const location = page.getByLabel('Damage location', { exact: true });
	async function hit(type: string, amount: number, hp: number) {
		await attack.selectOption(type);
		await page.getByLabel('Damage or healing amount').fill(String(amount));
		await page.getByRole('button', { name: 'DAMAGE', exact: true }).click();
		await expect(page.locator('.current')).toHaveText(String(hp));
		await expect.poll(async () => (await saved(page)).extra.currentHp).toBe(hp);
	}
	await expect(attack).toHaveValue('ranged');
	await hit('ranged', 7, 40);
	expect((await saved(page)).extra.gear[0].currentSp).toBeUndefined();
	await hit('melee', 7, 39);
	expect((await saved(page)).extra.gear[0].currentSp?.body).toBe(10);
	await hit('martial-arts', 6, 38);
	expect((await saved(page)).extra.gear[0].currentSp?.body).toBe(9);
	await hit('brawling', 9, 38);
	expect((await saved(page)).extra.gear[0].currentSp?.body).toBe(9);
	await hit('armor-piercing', 10, 37);
	expect((await saved(page)).extra.gear[0].currentSp?.body).toBe(7);
	await location.selectOption('head');
	// The sheet uses the shared Cracked Skull ×3 option after SP.
	await hit('armor-piercing', 14, 28);
	expect((await saved(page)).extra.gear[0].currentSp).toEqual({ body: 7, head: 9 });
	await page.getByRole('button', { name: 'FULL', exact: true }).click();
	await location.selectOption('body');
	await hit('rubber', 14, 33);
	await hit('rubber', 100, 1);
	expect((await saved(page)).extra.gear[0].currentSp).toEqual({ body: 7, head: 9 });
	await page.getByRole('button', { name: 'FULL', exact: true }).click();
	await hit('stun-baton', 8, 36);
	await hit('stun-baton', 100, 1);
	await expect(page.getByRole('status')).toContainText('unconscious');
	await page.getByRole('button', { name: 'FULL', exact: true }).click();
	await location.selectOption('head');
	await hit('direct', 6, 34);
	await expect(location).toBeDisabled();
	expect((await saved(page)).extra.gear[0].currentSp).toEqual({ body: 7, head: 9 });
	await attack.scrollIntoViewIfNeeded();
	await page.screenshot({ path: testInfo.outputPath('damage-types-mobile.png') });
	await page.reload();
	await expect(page.locator('.current')).toHaveText('34');
	await expect(attack).toHaveValue('ranged');
	// The tracker snapshots the same injury and writes ×3 head damage back to the sheet.
	await page.goto('/combat');
	await page.getByRole('button', { name: '+ Armor Test', exact: true }).click();
	await page.locator('.queue .card').getByRole('button', { name: /Armor Test/ }).click();
	await page.getByLabel('Hit location for Armor Test').selectOption('head');
	await expect(page.getByLabel('Hit location for Armor Test')).toContainText('×3');
	await page.getByLabel('Amount for Armor Test').fill('15');
	await page.getByRole('button', { name: 'DAMAGE', exact: true }).click();
	await expect.poll(async () => (await saved(page)).extra.currentHp).toBe(16);
	await page.goto('/characters/armor-special');
	await expect(page.locator('.current')).toHaveText('16');
	expect(errors).toEqual([]);
});
