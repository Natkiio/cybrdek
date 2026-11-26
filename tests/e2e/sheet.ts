import { expect, type Page } from '@playwright/test';

/** Which app-bar section holds each part of the sheet. */
const SECTION_OF: Record<string, string[]> = {
	'HIT POINTS': ['COMBAT'],
	WEAPONS: ['COMBAT'],
	ARMOR: ['COMBAT'],
	'CRITICAL INJURIES': ['COMBAT'],
	STATS: ['SKILLS'],
	SKILLS: ['SKILLS'],
	'IN THE NET': ['NET'],
	INTERFACE: ['NET'],
	CYBERDECK: ['KIT'], // installing takes an hour: it's kit, not something done mid-run
	'CYBERWARE & HUMANITY': ['KIT'],
	GEAR: ['KIT'],
	'IMPROVEMENT POINTS': ['FILE'],
	'PAST VERSIONS': ['FILE'],
	'ROLL LOG': ['FILE']
};

/** Show the app-bar section of the sheet that holds this part (named by its old fold title). */
export async function openSection(page: Page, title: string) {
	const bar = page.getByRole('navigation', { name: 'Sheet sections' });
	await expect(bar).toBeVisible();
	for (const label of SECTION_OF[title] ?? [title]) {
		const button = bar.getByRole('button', { name: new RegExp(`${label}$`) });
		if (await button.count()) {
			await button.click();
			await expect(button).toHaveAttribute('aria-current', 'page');
			return;
		}
	}
	throw new Error(`No sheet section for ${title}`);
}

/** Kept for older tests: sheet parts used to be folds, now they're app-bar sections. */
export const openFold = openSection;

/** Open the HP panel's damage form (attack type, location, amount). */
export async function openDamageForm(page: Page) {
	// Wait for the HP panel first: right after a load the form isn't drawn yet.
	const toggle = page.getByRole('button', { name: /^(DAMAGE \/ HEAL…|CLOSE)$/ });
	await expect(toggle).toBeVisible();
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(page.getByLabel('Attack type')).toBeVisible();
}
