import { test, expect, type Page } from '@playwright/test';

// Cyberware and Humanity on the sheet (#50). Everything is on the device.
async function seedCharacter(page: Page) {
	await page.goto('/characters');
	await expect(page.getByRole('heading').first()).toBeVisible();
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('cybrdek');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('characters', 'readwrite');
					tx.objectStore('characters').put({
						id: 'chrome',
						name: 'Chrome',
						rulesetId: 'cyberpunk-red',
						stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 },
						skills: {},
						extra: { role: 'solo', roleRank: 4 },
						updatedAt: Date.now()
					});
					tx.oncomplete = () => {
						open.result.close();
						resolve();
					};
				};
			})
	);
	await page.goto('/characters/chrome');
	await expect(page.getByRole('heading', { name: 'Chrome' })).toBeVisible();
}

async function choose(page: Page, type: string, item: string) {
	await page.getByLabel('Cyberware type').selectOption({ label: type });
	await page.getByLabel('Cyberware to install').selectOption({ label: item });
}

const panel = (page: Page) => page.locator('section.panel').filter({ hasText: 'CYBERWARE & HUMANITY' });

test('install cyberware, lose Humanity and EMP, keep the rules, reload', async ({ page, context }) => {
	await context.route(/supabase\.co/, (route) => route.abort());
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await seedCharacter(page);
	await expect(panel(page)).toContainText('50');
	await expect(panel(page)).toContainText('/ 50 Humanity · EMP 5');

	// An option can't go in before its foundation.
	await choose(page, 'Neuralware', 'Kerenzikov');
	await expect(panel(page)).toContainText('Needs a Neural Link');
	await expect(page.getByRole('button', { name: 'INSTALL', exact: true })).toBeDisabled();

	// Preset HL 7: 50 → 43, the maximum drops 2, EMP drops to 4.
	await choose(page, 'Neuralware', 'Neural Link');
	await page.getByRole('button', { name: 'INSTALL', exact: true }).click();
	await expect(panel(page)).toContainText('/ 48 Humanity · EMP 4 (from 5)');
	await expect(page.locator('.stat').filter({ hasText: 'EMP' })).toContainText('4');

	await choose(page, 'Neuralware', 'Kerenzikov');
	await page.getByLabel('Install in').selectOption({ label: 'Neural Link' });
	await page.getByRole('button', { name: 'INSTALL', exact: true }).click();
	await expect(panel(page)).toContainText('/ 46 Humanity · EMP 2 (from 5)'); // 43 − 14 = 29
	await expect(panel(page)).toContainText('Borderline dissociative disorder');

	await choose(page, 'Neuralware', 'Sandevistan');
	await expect(panel(page)).toContainText('Only 1 piece of Speedware');

	// A rolled loss replaces the preset, within the dice.
	await choose(page, 'Cyberoptics', 'Cybereye');
	await page.getByRole('button', { name: 'ROLL 2d6' }).click();
	const rolled = Number(await page.getByLabel('HUMANITY LOSS').inputValue());
	expect(rolled).toBeGreaterThanOrEqual(2);
	expect(rolled).toBeLessThanOrEqual(12);

	// A foundation can't come out with options in it.
	await page.getByRole('button', { name: 'Remove Neural Link' }).click();
	await page.getByRole('button', { name: 'CONFIRM' }).click();
	await expect(panel(page)).toContainText('Remove the 1 option inside it first');

	// Therapy raises Humanity, and it's all still there after a reload.
	await page.getByRole('button', { name: 'EXTREME · 4d6' }).click();
	await expect(panel(page)).toContainText('Therapy: rolled');
	const after = Number(await panel(page).locator('.value').innerText());
	expect(after).toBeGreaterThan(29);
	await expect.poll(async () => {
		await page.reload();
		return Number(await panel(page).locator('.value').innerText());
	}).toBe(after);
	await expect(page.getByRole('list', { name: 'Installed cyberware' })).toContainText('Kerenzikov');
	if (process.env.MAP_SCREENSHOT) await panel(page).screenshot({ path: process.env.MAP_SCREENSHOT });
	expect(errors).toEqual([]);
});
