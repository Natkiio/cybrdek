import { test, expect, type Page } from '@playwright/test';

// The combat tracker (#48). Everything lives on the device, so no Supabase here.
async function addNpc(page: Page, name: string, ref: number, hp: number, spBody: number, count = 1) {
	await page.getByLabel('NPC NAME').fill(name);
	await page.getByLabel('REF', { exact: true }).fill(String(ref));
	await page.getByLabel('HP', { exact: true }).fill(String(hp));
	await page.getByLabel('SP BODY').fill(String(spBody));
	await page.getByLabel('HOW MANY').fill(String(count));
	await page.getByRole('button', { name: 'ADD NPC' }).click();
}

const card = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
const queue = (page: Page) => page.locator('.queue .name').allInnerTexts();

test('run a fight: initiative order, turns, armor, reload, end', async ({ page, context }) => {
	await context.route(/supabase\.co/, (route) => route.abort());
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/combat');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller)
			await new Promise<void>((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
			);
	});
	await expect(page.getByText("Nobody's fighting yet.")).toBeVisible();

	await addNpc(page, 'Slow', 3, 30, 0);
	await addNpc(page, 'Boss', 8, 40, 11);
	await page.getByLabel('Initiative for Slow').fill('5');
	await page.getByLabel('Initiative for Slow').blur();
	await page.getByLabel('Initiative for Boss').fill('15');
	await page.getByLabel('Initiative for Boss').blur();
	await page.getByRole('button', { name: 'START FIGHT' }).click();

	await expect(page.getByText('ROUND 1')).toBeVisible();
	expect((await queue(page))[0]).toContain('Boss');
	await expect(page.getByText('Up now: Boss')).toBeVisible();

	await page.getByRole('button', { name: 'NEXT TURN →' }).click();
	await expect(page.getByText('Up now: Slow')).toBeVisible();
	await page.getByRole('button', { name: 'NEXT TURN →' }).click();
	await expect(page.getByText('ROUND 2')).toBeVisible();
	await expect(page.getByText('Up now: Boss')).toBeVisible();

	// 14 into SP 11: 3 through, and the armor ablates to 10.
	await card(page, 'Boss').getByRole('button', { name: /Boss/ }).click();
	await page.getByLabel('Amount for Boss').fill('14');
	await page.getByRole('button', { name: 'DAMAGE' }).click();
	await expect(card(page, 'Boss')).toContainText('37/40');
	await expect(card(page, 'Boss')).toContainText('SP 0/10');

	// A latecomer rolls in mid-fight without changing whose Turn it is.
	await addNpc(page, 'Ganger', 6, 20, 7, 2);
	await expect(page.locator('.queue > li')).toHaveCount(4);
	await expect(page.getByText('Up now: Boss')).toBeVisible();

	if (process.env.MAP_SCREENSHOT) await page.screenshot({ path: process.env.MAP_SCREENSHOT, fullPage: true });

	// Reload, then offline: the fight is still here.
	await page.reload();
	await expect(page.getByText('ROUND 2')).toBeVisible();
	await expect(card(page, 'Boss')).toContainText('37/40');
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByText('Up now: Boss')).toBeVisible();
	await context.setOffline(false);

	await page.getByRole('button', { name: 'END ENCOUNTER' }).click();
	await page.getByRole('button', { name: 'CONFIRM: END AND CLEAR' }).click();
	await expect(page.getByText("Nobody's fighting yet.")).toBeVisible();
	expect(errors).toEqual([]);
});

test("damage to a saved character reaches their sheet", async ({ page, context }) => {
	await context.route(/supabase\.co/, (route) => route.abort());
	await page.goto('/combat');
	await expect(page.getByRole('button', { name: 'ADD NPC' })).toBeVisible();
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('cybrdek');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('characters', 'readwrite');
					tx.objectStore('characters').put({
						id: 'gecko',
						name: 'Gecko',
						rulesetId: 'cyberpunk-red',
						stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 6 },
						skills: {},
						extra: { role: 'netrunner', roleRank: 4 },
						updatedAt: Date.now()
					});
					tx.oncomplete = () => {
						open.result.close();
						resolve();
					};
				};
			})
	);
	await page.reload();
	await page.getByRole('button', { name: '+ Gecko' }).click();
	await expect(page.getByRole('button', { name: '+ Gecko' })).toHaveCount(0); // can't be added twice
	await card(page, 'Gecko').getByRole('button', { name: /Gecko/ }).click();
	await page.getByLabel('Amount for Gecko').fill('10');
	await page.getByRole('button', { name: 'DAMAGE' }).click();
	const hp = await card(page, 'Gecko').locator('.hp').innerText();
	const [now, max] = hp.split('/').map(Number);
	expect(max - now).toBe(10);

	// The save runs in the background; wait for it before leaving the page.
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					new Promise<unknown>((resolve, reject) => {
						const open = indexedDB.open('cybrdek');
						open.onerror = () => reject(open.error);
						open.onsuccess = () => {
							const get = open.result.transaction('characters').objectStore('characters').get('gecko');
							get.onsuccess = () => {
								open.result.close();
								resolve(get.result?.extra?.currentHp);
							};
						};
					})
			)
		)
		.toBe(now);

	await page.goto('/characters/gecko');
	await expect(page.locator('.current')).toHaveText(String(now));
});
