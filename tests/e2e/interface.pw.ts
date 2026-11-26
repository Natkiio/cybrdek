import { test, expect, type Page } from '@playwright/test';
import { openFold } from './sheet.ts';

// A Netrunner's Interface (#100, part 3): NET Actions per Turn and tap-to-roll
// abilities, with a running Booster's bonus.
async function seed(page: Page, role: string, roleRank: number) {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await page.goto('/characters');
	await expect(page.getByRole('heading').first()).toBeVisible();
	await page.evaluate(
		([role, roleRank]) =>
			new Promise<void>((resolve, reject) => {
				const req = indexedDB.open('cybrdek');
				req.onerror = () => reject(req.error);
				req.onsuccess = () => {
					const db = req.result;
					const tx = db.transaction('characters', 'readwrite');
					tx.objectStore('characters').put({
						id: 'runner', name: 'Runner', rulesetId: 'cyberpunk-red',
						stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 }, skills: {},
						extra: {
							role, roleRank, humanity: 50,
							gear: [{ id: 'deck', kind: 'item', name: 'Cyberdeck', quantity: 1, cyberdeck: { quality: 'standard', hardware: [], programs: [
								{ id: 'p1', defId: 'worm', loaded: true }, { id: 'p2', defId: 'eraser', loaded: false }, { id: 'p3', defId: 'sword', loaded: true }
							] } }]
						},
						updatedAt: Date.now()
					});
					tx.oncomplete = () => { db.close(); resolve(); };
					tx.onerror = () => reject(tx.error);
				};
			}),
		[role, roleRank] as const
	);
	await page.goto('/characters/runner');
	await expect(page.getByRole('heading', { name: 'Runner', exact: true, level: 1 })).toBeVisible();
}

test('a Netrunner rolls Interface abilities; a running Booster adds its bonus', async ({ page }) => {
	await seed(page, 'netrunner', 4);
	await openFold(page, 'INTERFACE');
	await expect(page.getByText('NET ACTIONS PER TURN')).toContainText('3');

	await page.getByRole('button', { name: 'Roll Backdoor' }).click();
	const last = page.locator('.last-roll');
	await expect(last.locator('.label')).toHaveText('Backdoor (Interface)');
	await expect(last.locator('.dice')).toContainText('+4');

	// Only loaded Boosters can run: Worm is loaded, Eraser isn't, Sword isn't a Booster.
	const boosters = page.getByRole('group', { name: 'BOOSTERS RUNNING' });
	await expect(boosters.getByRole('checkbox')).toHaveCount(1);
	await boosters.getByLabel('Worm').check();
	await expect(page.getByRole('button', { name: 'Roll Backdoor' })).toContainText('+6');
	await page.getByRole('button', { name: 'Roll Backdoor' }).click();
	await expect(last.locator('.label')).toHaveText('Backdoor (Interface + Worm)');
	await expect(last.locator('.dice')).toContainText('+6');
	await expect(page.getByRole('button', { name: 'Roll Cloak' })).toContainText('+4');

	await page.getByRole('button', { name: '1d6 DMG' }).click();
	await expect(last.locator('.label')).toHaveText('Zap: damage');
	const total = Number(await last.locator('strong').textContent());
	expect(total).toBeGreaterThanOrEqual(1);
	expect(total).toBeLessThanOrEqual(6);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('other Roles have no Interface section', async ({ page }) => {
	await seed(page, 'solo', 4);
	const bar = page.getByRole('navigation', { name: 'Sheet sections' });
	await expect(bar.getByRole('button', { name: /COMBAT$/ })).toBeVisible();
	await expect(bar.getByRole('button', { name: /NET$/ })).toHaveCount(0);
	await expect(page.getByText('INTERFACE', { exact: true })).toHaveCount(0);
});
