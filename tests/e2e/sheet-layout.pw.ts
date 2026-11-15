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

const fold = (page: Page, title: string) =>
	page.locator('details.fold').filter({ has: page.locator('summary .title', { hasText: new RegExp(`^${title}$`) }) });
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

test('the rest is folded, with a one-line summary, and each fold remembers being open', async ({ page }) => {
	await open(page);
	const injuries = fold(page, 'CRITICAL INJURIES');
	await expect(injuries.locator('summary')).toContainText('1 · Broken Ribs');
	await expect(fold(page, 'ARMOR').locator('summary')).toContainText('SP head 11 · body 11');
	await expect(injuries).not.toHaveAttribute('open', '');

	await openFold(page, 'GEAR');
	const gear = section(page, 'GEAR');
	await expect(gear).toContainText('Light Armorjack');
	await expect(gear).toContainText('Agent');
	await expect(gear).not.toContainText('Very Heavy Pistol');

	await page.reload();
	await expect(fold(page, 'GEAR')).toHaveAttribute('open', '');
	await expect(injuries).not.toHaveAttribute('open', '');
});

test('on a laptop the sheet fills the screen in three columns', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await open(page);
	const hp = (await section(page, 'HIT POINTS').boundingBox())!;
	const skills = (await section(page, 'SKILLS').boundingBox())!;
	const rolls = (await section(page, 'ROLL LOG').boundingBox())!;
	expect(hp.x).toBeLessThan(skills.x);
	expect(skills.x).toBeLessThan(rolls.x);
	expect(Math.abs(hp.y - rolls.y)).toBeLessThan(40); // side by side, not stacked
	expect(rolls.x + rolls.width).toBeGreaterThan(1300); // uses the width, not a 960 px column
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('on a phone it is one column with no sideways scroll', async ({ page }) => {
	await open(page);
	const hp = (await section(page, 'HIT POINTS').boundingBox())!;
	const skills = (await section(page, 'SKILLS').boundingBox())!;
	expect(skills.y).toBeGreaterThan(hp.y);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('every critical damage roll reopens the injuries fold, even two in a row', async ({ page }) => {
	await page.addInitScript(() => {
		Math.random = () => 0.99; // every die rolls its highest: 4d6 shows four 6s, a critical
	});
	await open(page);
	const injuries = fold(page, 'CRITICAL INJURIES');
	const damage = section(page, 'WEAPONS').getByRole('button', { name: /^DMG/ });

	await damage.click();
	await expect(injuries).toHaveAttribute('open', '');
	await expect(page.getByRole('button', { name: 'ROLL INJURY FOR TARGET' })).toBeVisible();

	await injuries.locator('summary').click(); // the player closes it
	await expect(injuries).not.toHaveAttribute('open', '');
	await damage.click(); // another crit straight away
	await expect(injuries).toHaveAttribute('open', '');
	await expect(page.getByRole('button', { name: 'ROLL INJURY FOR TARGET' })).toBeVisible();
});
