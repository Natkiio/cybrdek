import { test, expect } from '@playwright/test';

test('Critical Injuries: target rolls, receiving, duplicate rerolls, persistence and treatment', async ({ page }, testInfo) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/characters');
	await page.evaluate(async () => {
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('cybrdek');
			request.onupgradeneeded = () => request.result.createObjectStore('characters', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction('characters', 'readwrite');
				tx.objectStore('characters').put({ id: 'injury-test', name: 'Injury Test', rulesetId: 'cyberpunk-red', stats: Object.fromEntries(['INT','REF','DEX','TECH','COOL','WILL','LUCK','MOVE','BODY','EMP'].map((id) => [id, 6])), skills: { handgun: 6 }, extra: { role: 'solo', currentHp: 40, gear: [{ id: 'pistol', name: 'Test Pistol', kind: 'weapon', skill: 'handgun', damage: '3d6' }] }, updatedAt: Date.now() });
				tx.oncomplete = () => { db.close(); resolve(); };
				tx.onerror = () => reject(tx.error);
			};
		});
	});
	await page.goto('/characters/injury-test');
	await expect(page.getByRole('heading', { name: 'Injury Test' })).toBeVisible();
	// Deterministic dice through the real UI: 3d6 all sixes triggers the offer.
	await page.evaluate(() => { Math.random = () => 0.999; });
	await page.getByRole('button', { name: 'DMG 3d6', exact: true }).click();
	await page.getByRole('button', { name: 'ROLL INJURY FOR TARGET', exact: true }).click();
	await expect(page.getByText('TARGET · body')).toContainText('Dismembered Leg');
	await expect(page.locator('.current')).toHaveText('40');
	await expect(page.getByRole('button', { name: 'APPLY TO THIS CHARACTER (−5 HP)' })).toHaveCount(0);
	await page.getByRole('button', { name: 'DISMISS INJURY ROLL' }).click();
	// Head result 3: Brain Injury, −2 actions and base Death Save +1.
	await page.getByLabel('INJURY LOCATION').selectOption('head');
	await page.evaluate(() => { let n = 0; Math.random = () => n++ % 2 === 0 ? 0 : 0.2; });
	await page.getByRole('button', { name: 'ROLL INJURY RECEIVED', exact: true }).click();
	await expect(page.getByText('RECEIVED · head')).toContainText('Brain Injury');
	await page.getByRole('button', { name: 'APPLY TO THIS CHARACTER (−5 HP)' }).click();
	await expect(page.locator('.current')).toHaveText('35');
	await expect(page.getByRole('button', { name: 'TREATED: REMOVE Brain Injury' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'TREATED: REMOVE Brain Injury' })).toBeVisible();
	await expect(page.locator('.current')).toHaveText('35');
	await page.getByLabel('INJURY LOCATION').selectOption('head');
	await page.evaluate(() => { let n = 0; Math.random = () => n++ % 2 === 0 ? 0 : 0.2; });
	await page.getByRole('button', { name: 'ROLL INJURY RECEIVED', exact: true }).click();
	await expect(page.getByRole('button', { name: 'REROLL INJURY RECEIVED' })).toBeVisible();
	await expect(page.locator('.current')).toHaveText('35');
	await page.getByRole('button', { name: 'DISMISS INJURY ROLL' }).click();
	await page.getByLabel('Attack type').selectOption('direct');
	await page.getByLabel('Damage or healing amount').fill('35');
	await page.getByRole('button', { name: 'DAMAGE', exact: true }).first().click();
	await expect(page.getByText('Penalty now: +1.', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'ROLL DEATH SAVE' }).click();
	await expect(page.getByText('Penalty now: +2.', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'ROLL DEATH SAVE' }).click();
	await expect(page.getByText('Penalty now: +3.', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'FULL', exact: true }).click();
	await page.getByRole('button', { name: 'RESET', exact: true }).click();
	await page.getByRole('button', { name: 'TREATED: REMOVE Brain Injury' }).scrollIntoViewIfNeeded();
	await page.screenshot({ path: testInfo.outputPath('injuries-mobile.png') });
	const panel = await page.locator('section').filter({ has: page.getByText('CRITICAL INJURIES', { exact: true }) }).boundingBox();
	expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
	await page.getByRole('button', { name: 'TREATED: REMOVE Brain Injury' }).click();
	await expect(page.getByText('No active injuries.', { exact: true })).toBeVisible();
	// Wait for the asynchronous IndexedDB commit before navigating away.
	await expect.poll(() => page.evaluate(() => new Promise<number>((resolve) => {
		const request = indexedDB.open('cybrdek');
		request.onsuccess = () => {
			const db = request.result;
			const read = db.transaction('characters').objectStore('characters').get('injury-test');
			read.onsuccess = () => { db.close(); resolve(read.result.extra.criticalInjuries.length); };
		};
	}))).toBe(0);
	await page.reload();
	await expect(page.getByText('No active injuries.', { exact: true })).toBeVisible();
	await expect(page.locator('.current')).toHaveText('40');
	expect(errors).toEqual([]);
});
