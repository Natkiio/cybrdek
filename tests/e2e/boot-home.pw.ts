import { test, expect, type Page } from '@playwright/test';

// The boot sequence and the home dashboard (#101). Supabase is cut off: all of
// this works from the device alone.
const FORCE = 'cybrdek:force-boot';

async function seed(page: Page, character: Record<string, unknown>) {
	await page.goto('/characters');
	await expect(page.getByRole('heading').first()).toBeVisible();
	await page.evaluate(
		(c) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('cybrdek');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('characters', 'readwrite');
					tx.objectStore('characters').put({ ...c, updatedAt: Date.now() });
					tx.oncomplete = () => {
						open.result.close();
						resolve();
					};
				};
			}),
		character
	);
}

const vex = {
	id: 'vex',
	name: 'Vex',
	rulesetId: 'cyberpunk-red',
	stats: { INT: 6, REF: 8, DEX: 7, TECH: 5, COOL: 7, WILL: 6, LUCK: 5, MOVE: 6, BODY: 7, EMP: 5 },
	skills: { handgun: 6 },
	extra: { role: 'solo', roleRank: 4, currentHp: 10, criticalInjuries: [{ location: 'body', roll: 5 }] }
};

test.beforeEach(async ({ context }) => {
	await context.route(/supabase\.co/, (route) => route.abort());
});

test('opening the app plays the boot sequence, then lands on the page', async ({ page }) => {
	await page.addInitScript((key) => localStorage.setItem(key, '1'), FORCE);
	await page.goto('/');
	const skip = page.getByRole('button', { name: '[ TAP TO SKIP ]' });
	await expect(skip).toBeVisible();
	await expect(page.getByText('link campaign VOYAGE CITY')).toBeVisible();
	await expect(skip).toHaveCount(0, { timeout: 6000 }); // about 3 s, then gone by itself
	await expect(page.getByRole('heading', { name: 'Home' })).toBeAttached();
});

test('a tap or any key skips it, and moving between pages never replays it', async ({ page }) => {
	await page.addInitScript((key) => localStorage.setItem(key, '1'), FORCE);
	await page.goto('/');
	await page.getByRole('button', { name: '[ TAP TO SKIP ]' }).click();
	await expect(page.getByRole('button', { name: '[ TAP TO SKIP ]' })).toHaveCount(0);

	await page.getByRole('link', { name: /DICE/ }).first().click();
	await expect(page).toHaveURL(/\/dice$/);
	await expect(page.getByRole('button', { name: '[ TAP TO SKIP ]' })).toHaveCount(0);

	await page.reload(); // a fresh open plays it again
	await expect(page.getByRole('button', { name: '[ TAP TO SKIP ]' })).toBeVisible();
	await page.keyboard.press('Space');
	await expect(page.getByRole('button', { name: '[ TAP TO SKIP ]' })).toHaveCount(0);
});

test('with reduced motion it never shows', async ({ browser }) => {
	const context = await browser.newContext({ reducedMotion: 'reduce' });
	const page = await context.newPage();
	await page.addInitScript((key) => localStorage.setItem(key, '1'), FORCE);
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Home' })).toBeAttached();
	await expect(page.getByRole('button', { name: '[ TAP TO SKIP ]' })).toBeHidden();
	await context.close();
});

test('home shows your character at a glance and links to the sheet', async ({ page }) => {
	await seed(page, vex);
	await page.goto('/');
	const card = page.getByRole('region', { name: 'Your character' });
	await expect(card).toContainText('Vex');
	await expect(card).toContainText('Solo 4');
	await expect(card).toContainText('10 / 45 HP'); // BODY 7, WILL 6
	await expect(card).toContainText('Seriously Wounded');
	await expect(card).toContainText('Broken Ribs');
	await card.getByRole('link', { name: 'SHEET →' }).click();
	await expect(page).toHaveURL(/\/characters\/vex$/);
});

test('with no character, home offers to make one; next-up links go where they say', async ({ page }) => {
	await page.goto('/');
	const card = page.getByRole('region', { name: 'Your character' });
	await expect(card).toContainText('No character on this device yet.');
	await expect(card.getByRole('link', { name: '+ MAKE A CHARACTER' })).toHaveAttribute('href', '/characters/new');
	for (const [label, href] of [['COMBAT', '/combat'], ['MAP', '/map'], ['DICE', '/dice'], ['LORE', '/lore']]) {
		await expect(page.getByRole('region', { name: 'NEXT UP' }).getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute('href', href);
	}
});

test('the roll log shows only the last 5 rolls', async ({ page }) => {
	await page.goto('/dice');
	for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'd6', exact: true }).click();
	const log = page.locator('section.panel').filter({ hasText: 'ROLL LOG' });
	await expect(log.locator('li')).toHaveCount(5);
});


test('reduced-motion CSS hides the server-rendered boot while hydration is delayed', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ baseURL, reducedMotion: 'reduce', serviceWorkers: 'block' });
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	await context.route(/\/_app\/immutable\/.*\.js(?:\?|$)/, async (route) => {
		await gate;
		await route.continue();
	});
	try {
		const page = await context.newPage();
		await page.addInitScript((key) => localStorage.setItem(key, '1'), FORCE);
		const navigating = page.goto('/', { waitUntil: 'domcontentloaded' });
		const boot = page.locator('.boot');
		await expect(boot).toBeAttached();
		await expect(boot).toHaveCSS('display', 'none');
		await expect(boot).toBeHidden();
		release();
		await navigating;
		await expect(boot).toHaveCount(0);
	} finally {
		release();
		await context.close();
	}
});

test('dashboard sheet links encode reserved characters in imported IDs', async ({ page }) => {
	const id = 'runner?version=1#copy';
	await seed(page, { ...vex, id });
	await page.reload();
	await expect(page.getByRole('link', { name: 'OPEN', exact: true })).toHaveAttribute('href', `/characters/${encodeURIComponent(id)}`);
	await page.goto('/');
	const sheet = page.getByRole('link', { name: 'SHEET →', exact: true });
	await expect(sheet).toHaveAttribute('href', `/characters/${encodeURIComponent(id)}`);
	await sheet.click();
	await expect(page.getByRole('heading', { name: 'Vex', exact: true })).toBeVisible();
	await expect(page.getByText('NOT FOUND', { exact: true })).toHaveCount(0);
});
