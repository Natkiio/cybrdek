import { test, expect } from '@playwright/test';
import { openFold } from './sheet.ts';

// A new Netrunner can start with the Streetrat kit (Core p. 103): a loaded
// Standard deck and Virtuality Goggles, ready for the NET on the sheet.
test('creating a Netrunner with the starter kit gives a working deck', async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await page.setViewportSize({ width: 360, height: 740 });
	await page.goto('/characters/new');
	await page.getByPlaceholder('e.g. Johnny Silverhand').fill('Kit Runner');
	await page.getByRole('button', { name: 'NEXT →' }).click();

	await page.getByRole('button', { name: /Netrunner/ }).click();
	await expect(page.getByLabel(/Start with the Netrunner kit/)).toBeChecked();
	await page.getByRole('group', { name: 'PROGRAM 1' }).getByLabel('Eraser').check();
	await page.getByRole('group', { name: 'PROGRAM 2' }).getByLabel('Vrizzbolt').check();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'NEXT →' }).click();

	await page.getByRole('button', { name: 'Raise REF' }).click();
	await page.getByRole('button', { name: 'Raise INT' }).click();
	await page.getByRole('button', { name: 'NEXT →' }).click();
	await page.getByRole('button', { name: 'NEXT →' }).click();
	await expect(page.getByText(/Standard Cyberdeck: Armor · Sword · Eraser · Vrizzbolt · Worm · Virtuality Goggles/)).toBeVisible();
	await page.getByRole('button', { name: 'CREATE CHARACTER' }).click();

	await expect(page.getByRole('heading', { name: 'Kit Runner', exact: true, level: 1 })).toBeVisible();
	await openFold(page, 'INTERFACE');
	await expect(page.getByRole('group', { name: 'BOOSTERS RUNNING' }).getByLabel('Eraser')).toBeVisible();
	await openFold(page, 'IN THE NET');
	await page.getByRole('button', { name: 'JACK IN' }).click();
	// Goggles came with the kit, so no Unconscious warning.
	await expect(page.getByRole('list', { name: 'Meatspace risks' })).not.toContainText('Unconscious');
});

test('a Netrunner can skip the kit and start with no gear', async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await page.goto('/characters/new');
	await page.getByPlaceholder('e.g. Johnny Silverhand').fill('Bare Runner');
	await page.getByRole('button', { name: 'NEXT →' }).click();
	await page.getByRole('button', { name: /Netrunner/ }).click();
	await page.getByLabel(/Start with the Netrunner kit/).uncheck();
	await expect(page.getByRole('group', { name: 'PROGRAM 1' })).toHaveCount(0);
	await page.getByRole('button', { name: 'NEXT →' }).click();
	await page.getByRole('button', { name: 'Raise REF' }).click();
	await page.getByRole('button', { name: 'Raise INT' }).click();
	await page.getByRole('button', { name: 'NEXT →' }).click();
	await page.getByRole('button', { name: 'NEXT →' }).click();
	await expect(page.getByText('STARTER DECK')).toHaveCount(0);
	await page.getByRole('button', { name: 'CREATE CHARACTER' }).click();
	await expect(page.getByRole('heading', { name: 'Bare Runner', exact: true, level: 1 })).toBeVisible();
	await openFold(page, 'CYBERDECK');
	await expect(page.locator('details.fold summary', { hasText: 'CYBERDECK' })).toContainText('none');
});
