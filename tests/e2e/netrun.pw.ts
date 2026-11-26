import { test, expect, type Page } from '@playwright/test';
import { openFold } from './sheet.ts';

// Being in the NET (#100, part 4): jack in and out, the floor you're on, saved
// running Boosters and the Meatspace risks.
const PLAYER = '10000000-0000-4000-8000-000000000002';

async function seed(page: Page, extraGear: unknown[] = []) {
	await page.goto('/characters');
	await expect(page.getByRole('heading').first()).toBeVisible();
	await page.evaluate(
		(extraGear) =>
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
							role: 'netrunner', roleRank: 4, humanity: 50,
							gear: [
								{ id: 'deck', kind: 'item', name: 'Cyberdeck', quantity: 1, cyberdeck: { quality: 'standard', hardware: [], programs: [{ id: 'p1', defId: 'worm', loaded: true }] } },
								...extraGear
							]
						},
						updatedAt: Date.now()
					});
					tx.oncomplete = () => { db.close(); resolve(); };
					tx.onerror = () => reject(tx.error);
				};
			}),
		extraGear
	);
	await page.goto('/characters/runner');
	await expect(page.getByRole('heading', { name: 'Runner', exact: true, level: 1 })).toBeVisible();
}

test('offline: jack in, go deeper, the run and running Boosters survive a reload, and an unsafe Jack Out resets them', async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await seed(page);
	await openFold(page, 'IN THE NET');
	await expect(page.locator('.status')).toHaveText('NOT JACKED IN');
	await page.getByRole('button', { name: 'JACK IN' }).click();
	await expect(page.locator('.status')).toHaveText(/JACKED IN · Floor 1/);
	// No Virtuality Goggles: the runner is out cold in Meatspace.
	const risks = page.getByRole('list', { name: 'Meatspace risks' });
	await expect(risks).toContainText('Unconscious');
	await page.getByRole('button', { name: '▼ DOWN' }).click();
	await page.getByRole('button', { name: '▼ DOWN' }).click();
	await expect(page.locator('.status')).toHaveText(/Floor 3/);

	await openFold(page, 'INTERFACE');
	await page.getByRole('group', { name: 'BOOSTERS RUNNING' }).getByLabel('Worm').check();
	await expect(page.getByRole('button', { name: 'Roll Backdoor' })).toContainText('+6');

	await page.reload();
	await expect(page.locator('details.fold summary', { hasText: 'IN THE NET' })).toContainText('JACKED IN · Floor 3');
	await expect(page.getByRole('group', { name: 'BOOSTERS RUNNING' }).getByLabel('Worm')).toBeChecked();

	await page.getByRole('button', { name: 'LEFT RANGE' }).click();
	await expect(page.locator('.notice')).toContainText('Black ICE');
	await expect(page.locator('.status')).toHaveText('NOT JACKED IN');
	await expect(page.getByRole('group', { name: 'BOOSTERS RUNNING' }).getByLabel('Worm')).not.toBeChecked();
	await expect(page.getByRole('button', { name: 'Roll Backdoor' })).toContainText('+4');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('signed in: run a revealed campaign Architecture floor by floor', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.context().addInitScript((user) => {
		localStorage.setItem(
			'sb-hntlvhspyllaaidvxlox-auth-token',
			JSON.stringify({
				access_token: 'token', refresh_token: 'refresh', token_type: 'bearer',
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: { id: user, email: 'player@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' }
			})
		);
	}, PLAYER);
	// What the database sends a player: revealed floors only, no DVs, no GM notes.
	const view = {
		canManage: false,
		architectures: [{
			id: 'arch', revision: 1, name: 'Zetatech Relay',
			floors: [
				{ id: 'f1', label: 'Lobby', entries: [{ id: 'e1', type: 'password', name: 'Door Code', refId: null, playerText: 'A blinking keypad.' }] },
				{ id: 'f2', label: 'Vault', entries: [{ id: 'e2', type: 'file', name: 'Payroll', refId: null, playerText: '' }] }
			]
		}]
	};
	await page.context().route(/supabase\.co/, (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(new URL(route.request().url()).pathname.endsWith('/rpc/campaign_net_architectures') ? view : route.request().url().includes('/rpc/') ? false : [])
		})
	);
	await seed(page, [{ id: 'g', kind: 'item', name: 'Virtuality Goggles', quantity: 1 }]);
	await openFold(page, 'IN THE NET');
	await page.getByRole('combobox').selectOption({ label: 'Zetatech Relay' });
	await page.getByRole('button', { name: 'JACK IN' }).click();
	await expect(page.locator('.status')).toHaveText(/JACKED IN · Zetatech Relay · Lobby/);
	const here = page.getByRole('list', { name: 'On this floor' });
	await expect(here).toContainText('Door Code');
	await expect(here).toContainText('A blinking keypad.');
	// The stairs: the current step is marked, a dark step hints at more below,
	// and the Password offers Backdoor right there, rolled into the log.
	const floors = page.getByRole('list', { name: 'Floors' });
	await expect(floors.locator('[aria-current="step"]')).toContainText('Lobby');
	await expect(floors.getByLabel('Deeper floors not revealed')).toBeVisible();
	await page.getByRole('button', { name: 'Roll Backdoor here' }).click();
	await expect(page.locator('.last-roll .label')).toHaveText('Backdoor (Interface)');
	await page.getByRole('button', { name: 'Vault' }).click();
	await expect(page.locator('.status')).toHaveText(/Vault/);
	await expect(here).toContainText('Payroll');
	await expect(floors.locator('[aria-current="step"]')).toContainText('Vault');
	await expect(page.getByRole('button', { name: 'Roll Eye-Dee here' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	// Goggles on: no Unconscious warning, but the range warning stays.
	const risks = page.getByRole('list', { name: 'Meatspace risks' });
	await expect(risks).not.toContainText('Unconscious');
	await expect(risks).toContainText('6 m/yds');
	await page.getByRole('button', { name: 'JACK OUT' }).click();
	await expect(page.locator('.notice')).toContainText('resets');
});

test('a Booster unloaded after it was marked running stops counting, even after a reload', async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await seed(page);
	await openFold(page, 'INTERFACE');
	await page.getByRole('group', { name: 'BOOSTERS RUNNING' }).getByLabel('Worm').check();
	await expect(page.getByRole('button', { name: 'Roll Backdoor' })).toContainText('+6');
	// Unload Worm straight in the saved character, as the CYBERDECK panel does.
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const req = indexedDB.open('cybrdek');
				req.onsuccess = () => {
					const tx = req.result.transaction('characters', 'readwrite');
					const store = tx.objectStore('characters');
					const get = store.get('runner');
					get.onsuccess = () => {
						const c = get.result;
						c.extra.gear[0].cyberdeck.programs[0].loaded = false;
						store.put(c);
					};
					tx.oncomplete = () => { req.result.close(); resolve(); };
					tx.onerror = () => reject(tx.error);
				};
			})
	);
	await page.reload();
	await expect(page.getByRole('group', { name: 'BOOSTERS RUNNING' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Roll Backdoor' })).toContainText('+4');
});

test('a deck with a Range Upgrade gives 8 m/yds of range', async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await seed(page);
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const req = indexedDB.open('cybrdek');
				req.onsuccess = () => {
					const tx = req.result.transaction('characters', 'readwrite');
					const store = tx.objectStore('characters');
					const get = store.get('runner');
					get.onsuccess = () => {
						const c = get.result;
						c.extra.gear[0].cyberdeck.hardware = [{ id: 'h1', defId: 'range-upgrade' }];
						store.put(c);
					};
					tx.oncomplete = () => { req.result.close(); resolve(); };
					tx.onerror = () => reject(tx.error);
				};
			})
	);
	await page.reload();
	await openFold(page, 'IN THE NET');
	await expect(page.getByText(/within 8 m\/yds of an access point/)).toBeVisible();
	await page.getByRole('button', { name: 'JACK IN' }).click();
	await expect(page.getByRole('list', { name: 'Meatspace risks' })).toContainText('Stay within 8 m/yds');
});
