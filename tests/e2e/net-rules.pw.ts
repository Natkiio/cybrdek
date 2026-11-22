import { test, expect } from '@playwright/test';

// NET rules quick reference (#100): our own summaries, reachable from /rules.
test('the NET rules reference opens from the rules page and fits a phone', async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
	await page.setViewportSize({ width: 360, height: 740 });
	await page.goto('/rules');
	await page.getByRole('link', { name: 'NET RULES QUICK REFERENCE →' }).click();
	await expect(page.getByRole('heading', { name: 'NET RULES', level: 1 })).toBeVisible();
	for (const title of ['Your Turn', 'Interface Abilities', 'Black ICE', 'Getting out'])
		await expect(page.getByRole('heading', { name: new RegExp(`^${title}`), level: 2 })).toBeVisible();
	await page.getByRole('navigation', { name: 'NET rules sections' }).getByRole('link', { name: 'NET combat' }).click();
	await expect(page).toHaveURL(/#combat$/);
	await expect(page.locator('#combat')).toContainText('Zap');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
