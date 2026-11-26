import { test, expect, type Page } from '@playwright/test';
import { openFold } from './sheet.ts';

// The redesigned character sheet (#101): what's up front, what's folded away,
// and the laptop layout. Everything here is on the device.
const vex = {
	id: 'vex',
	name: 'Vex',
	rulesetId: 'cyberpunk-red',
	stats: { INT: 6, REF: 8, DEX: 7, TECH: 5, COOL: 7, WILL: 6, LUCK: 5, MOVE: 6, BODY: 7, EMP: 5 },
	skills: { handgun: 6, evasion: 5 },
	extra: {
		role: 'solo',
		roleRank: 4,
		currentHp: 28,
		gear: [
			{ id: 'g1', kind: 'weapon', name: 'Very Heavy Pistol', skill: 'handgun', damage: '4d6', rof: 1, magazine: 8, ammo: 6 },
			{ id: 'g2', kind: 'armor', name: 'Light Armorjack', sp: 11, location: 'both', equipped: true },
			{ id: 'g3', kind: 'item', name: 'Agent', quantity: 1 }
		],
		criticalInjuries: [{ location: 'body', roll: 5 }]
	}
};

async function open(page: Page) {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await page.goto('/characters');
	await expect(page.getByRole('heading', { name: 'CHARACTERS' })).toBeVisible();
	// The app creates its storage as the page loads; write only once the table exists.
	await expect
		.poll(() =>
			page.evaluate(
				(c) =>
					new Promise<boolean>((resolve) => {
						const db = indexedDB.open('cybrdek');
						db.onerror = () => resolve(false);
						db.onsuccess = () => {
							if (!db.result.objectStoreNames.contains('characters')) {
								db.result.close();
								return resolve(false);
							}
							const tx = db.result.transaction('characters', 'readwrite');
							tx.objectStore('characters').put({ ...c, updatedAt: Date.now() });
							tx.oncomplete = () => {
								db.result.close();
								resolve(true);
							};
							tx.onerror = () => resolve(false);
						};
					}),
				vex
			)
		)
		.toBe(true);
	await page.goto('/characters/vex');
	await expect(page.getByRole('heading', { name: 'Vex', level: 1 })).toBeVisible();
}

const section = (page: Page, title: string) => page.locator('section.panel').filter({ has: page.getByText(title, { exact: true }) });

test('up front: HP, stats, weapons and skills; the damage form waits behind a button', async ({ page }) => {
	await open(page);
	await expect(page.getByLabel('Attack type')).toHaveCount(0);
	await page.getByRole('button', { name: 'DAMAGE / HEAL…' }).click();
	await expect(page.getByLabel('Attack type')).toBeVisible();
	await page.getByRole('button', { name: 'CLOSE' }).click();
	await expect(page.getByLabel('Attack type')).toHaveCount(0);

	const weapons = section(page, 'WEAPONS');
	await expect(weapons).toContainText('Very Heavy Pistol');
	await expect(weapons).not.toContainText('Light Armorjack');
	await expect(weapons.getByRole('button', { name: /ATTACK/ })).toBeVisible();
	await expect(weapons.getByRole('button', { name: '+ ARMOR' })).toHaveCount(0);
});

const bar = (page: Page) => page.getByRole('navigation', { name: 'Sheet sections' });
const status = (page: Page) => page.getByRole('group', { name: 'Status' });

test('status chips sum up the sheet; KIT holds the gear; the section survives a reload', async ({ page }) => {
	await open(page);
	await expect(bar(page).getByRole('button', { name: /COMBAT$/ })).toHaveAttribute('aria-current', 'page');
	await expect(status(page).getByRole('button', { name: /INJ/ })).toContainText('1');
	await expect(status(page).getByRole('button', { name: /SP/ })).toContainText('11/11');
	await expect(section(page, 'CRITICAL INJURIES')).toContainText('Broken Ribs');

	await openFold(page, 'GEAR');
	const gear = section(page, 'GEAR');
	await expect(gear).toContainText('Light Armorjack');
	await expect(gear).toContainText('Agent');
	await expect(gear).not.toContainText('Very Heavy Pistol');
	await expect(section(page, 'HIT POINTS')).toHaveCount(0); // one section at a time
	await expect(page).toHaveURL(/#kit$/);

	await page.reload();
	await expect(bar(page).getByRole('button', { name: /KIT$/ })).toHaveAttribute('aria-current', 'page');
	await expect(section(page, 'GEAR')).toContainText('Light Armorjack');

	// A chip jumps to its section.
	await status(page).getByRole('button', { name: /HP/ }).click();
	await expect(section(page, 'HIT POINTS')).toBeVisible();
});

test('on a laptop: a rail on the left, the section in the middle, STATS and ROLL LOG on the right', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await open(page);
	const rail = (await bar(page).boundingBox())!;
	const hp = (await section(page, 'HIT POINTS').boundingBox())!;
	const stats = (await section(page, 'STATS').boundingBox())!;
	const rolls = (await section(page, 'ROLL LOG').boundingBox())!;
	expect(rail.x).toBeLessThan(hp.x);
	expect(hp.x).toBeLessThan(stats.x);
	expect(Math.abs(hp.y - stats.y)).toBeLessThan(40); // side by side, not stacked
	expect(rolls.y).toBeGreaterThan(stats.y); // the log sits under STATS
	expect(rolls.x + rolls.width).toBeGreaterThan(1300); // uses the width, not a 960 px column
	// STATS stay on the right whatever the section; SKILLS doesn't repeat them.
	await openFold(page, 'SKILLS');
	await expect(section(page, 'STATS')).toHaveCount(1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('on a phone the app bar is pinned to the bottom, with no sideways scroll', async ({ page }) => {
	await open(page);
	const box = (await bar(page).boundingBox())!;
	const height = page.viewportSize()!.height;
	expect(Math.round(box.y + box.height)).toBe(height);
	await page.mouse.wheel(0, 2000);
	expect(Math.round((await bar(page).boundingBox())!.y + box.height)).toBe(height); // still there after scrolling
	await expect(section(page, 'SKILLS')).toHaveCount(0);
	await openFold(page, 'SKILLS');
	await expect(section(page, 'STATS')).toBeVisible(); // on a phone STATS live in SKILLS
	await expect(section(page, 'SKILLS')).toBeVisible();
	await openFold(page, 'ROLL LOG');
	await expect(section(page, 'ROLL LOG')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a critical damage roll offers the injury roll in COMBAT, every time', async ({ page }) => {
	await page.addInitScript(() => {
		Math.random = () => 0.99; // every die rolls its highest: 4d6 shows four 6s, a critical
	});
	await open(page);
	const damage = section(page, 'WEAPONS').getByRole('button', { name: /^DMG/ });
	await damage.click();
	await expect(page.getByRole('button', { name: 'ROLL INJURY FOR TARGET' })).toBeVisible();
	await damage.click(); // another crit straight away
	await expect(page.getByRole('button', { name: 'ROLL INJURY FOR TARGET' })).toBeVisible();
	await expect(bar(page).getByRole('button', { name: /COMBAT$/ })).toHaveAttribute('aria-current', 'page');
});
