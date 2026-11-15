import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => { await context.route(/supabase\.co/, route => route.abort()); });

test('Escape restores focus to the menu toggle; Enter can reopen it', async ({ page }) => {
	await page.goto('/characters');
	const toggle = page.getByRole('button', { name: 'Menu', exact: true });
	await toggle.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
	await page.keyboard.press('Tab');
	await expect(page.locator('#site-menu a').first()).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.locator('#site-menu')).toHaveCount(0);
	await expect(toggle).toBeFocused();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await page.keyboard.press('Enter');
	await expect(page.locator('#site-menu')).toBeVisible();
	await page.keyboard.press('Tab');
	await expect(page.locator('#site-menu a').first()).toBeFocused();
});

test('Escape outside the open menu preserves the current input focus', async ({ page }) => {
	await page.goto('/dice');
	await page.getByRole('button', { name: 'Menu', exact: true }).click();
	const input = page.getByLabel('Dice expression');
	await input.focus();
	await page.keyboard.press('Escape');
	await expect(page.locator('#site-menu')).toHaveCount(0);
	await expect(input).toBeFocused();
});

for (const width of [390, 1280]) {
	test(`navigation and long campaign names fit at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await page.addInitScript(() => localStorage.setItem('cybrdek:campaign', JSON.stringify({
			id: 'c0000000-0000-4000-8000-000000000002', name: 'CampaignWithAnEightyCharacterNameABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123'
		})));
		await page.goto('/characters/new');
		await page.evaluate(() => document.fonts.ready);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		if (width === 390) {
			await page.getByRole('button', { name: 'Menu', exact: true }).click();
			await expect(page.locator('#site-menu a[aria-current="page"]')).toHaveText(/CHARACTERS/);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		} else {
			await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden();
			const ys = await page.locator('.inline a').evaluateAll(links => links.map(a => Math.round(a.getBoundingClientRect().y)));
			expect(new Set(ys).size).toBe(1);
		}
	});
}

test('roll modifiers retain readable text contrast after the flash settles', async ({ page }) => {
	await page.goto('/dice');
	await page.getByLabel('Dice expression').fill('1d10+12');
	await page.getByRole('button', { name: 'ROLL', exact: true }).click();
	await page.locator('.rolls li').first().evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
	const colors = await page.locator('.rolls .modifier').first().evaluate(el => ({
		text: getComputedStyle(el).color, background: getComputedStyle(el.closest('li')!).backgroundColor
	}));
	const luminance = (rgb: string) => rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(c => c / 255)
		.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
		.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
	const light = luminance(colors.text), dark = luminance(colors.background);
	expect((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
