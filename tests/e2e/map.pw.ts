import { test, expect, type Page } from '@playwright/test';
import { DISTRICTS, MAP_WIDTH } from '../../src/lib/map/districts.ts';

test.use({ hasTouch: true });

const map = (page: Page) => page.getByRole('application', { name: 'Voyage City interactive map' });
const percent = async (page: Page) => Number((await page.getByLabel('Map zoom').innerText()).replace('%', ''));
async function ready(page: Page) {
	await page.goto('/map');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
	});
	await expect(page.locator('.scene img')).toBeVisible();
	await expect.poll(() => page.locator('.scene img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
}
async function tapDistrict(page: Page, name: string) {
	const district = DISTRICTS.find((d) => d.name === name)!;
	const box = (await page.locator('.scene').boundingBox())!;
	await page.touchscreen.tap(box.x + district.label[0] * box.width / MAP_WIDTH, box.y + district.label[1] * box.width / MAP_WIDTH);
}
async function cached(page: Page, path: string) {
	return page.evaluate(async (path) => {
		const cache = await caches.open((await caches.keys()).find((key) => key.startsWith('cybrdek-'))!);
		return Boolean(await cache.match(path));
	}, path);
}

test('district tapping, focused list, wheel/pan/keyboard and real touch pinch', async ({ page, context }, testInfo) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await ready(page);
	await expect(page.getByLabel('Map zoom')).toHaveText('100%');
	await tapDistrict(page, 'West Ridge');
	await expect(page.getByLabel('Selected district')).toContainText('West Ridge');
	await expect(page.locator('polygon.selected')).toHaveCount(1);
	await page.getByLabel('Close district popup').click();
	await expect(page.getByLabel('Selected district')).toHaveCount(0);
	await page.getByText('CHOOSE A DISTRICT', { exact: false }).click();
	await page.getByRole('button', { name: 'Nova Peak', exact: true }).click();
	await expect(page.getByLabel('Selected district')).toContainText('Nova Peak');
	expect(await percent(page)).toBeGreaterThan(100);
	await expect.poll(() => page.locator('.scene img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(3072);
	await expect.poll(() => cached(page, '/maps/voyage-detail.webp')).toBe(true);
	await page.screenshot({ path: testInfo.outputPath('map-mobile.png'), fullPage: true });

	// Dragging pans without selecting a new district at the release location.
	await map(page).scrollIntoViewIfNeeded();
	const box = (await map(page).boundingBox())!;
	const before = await page.locator('.scene').getAttribute('style');
	await page.mouse.move(box.x + box.width * 0.65, box.y + 80);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.65 - 70, box.y + 110, { steps: 8 });
	await page.mouse.up();
	await expect.poll(() => page.locator('.scene').getAttribute('style')).not.toBe(before);
	await expect(page.getByLabel('Selected district')).toContainText('Nova Peak');
	await map(page).focus();
	await page.keyboard.press('Escape');
	await expect(page.getByLabel('Selected district')).toHaveCount(0);
	await page.keyboard.press('Home');
	await expect(page.getByLabel('Map zoom')).toHaveText('100%');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -400);
	await expect.poll(() => percent(page)).toBeGreaterThan(100);
	await page.getByRole('button', { name: 'FIT MAP', exact: true }).click();

	// CDP sends actual two-contact touch events through the browser's pointer handling.
	await map(page).scrollIntoViewIfNeeded();
	const touchBox = (await map(page).boundingBox())!;
	const cdp = await context.newCDPSession(page);
	const cx = touchBox.x + touchBox.width / 2, cy = touchBox.y + touchBox.height / 2;
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
		{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }
	] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
		{ x: cx - 80, y: cy - 10, id: 1 }, { x: cx + 80, y: cy + 10, id: 2 }
	] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect.poll(() => percent(page)).toBeGreaterThan(200);
	expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
	await expect(page.getByLabel('Selected district')).toHaveCount(0);
	await cdp.detach();
	await page.setViewportSize({ width: 1200, height: 850 });
	await page.getByRole('button', { name: 'FIT MAP', exact: true }).click();
	await tapDistrict(page, 'Daynedale');
	await expect(page.getByLabel('Selected district')).toContainText('Daynedale');
	await page.screenshot({ path: testInfo.outputPath('map-desktop.png'), fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	expect(errors).toEqual([]);
});

test('overview works offline before detail was ever loaded', async ({ page, context }) => {
	await ready(page);
	expect(await cached(page, '/maps/voyage-overview.webp')).toBe(true);
	expect(await cached(page, '/maps/voyage-detail.webp')).toBe(false);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByLabel('Map zoom')).toHaveText('100%');
	await tapDistrict(page, 'Eagleton');
	await expect(page.getByLabel('Selected district')).toContainText('Eagleton');
	await page.getByLabel('Close district popup').click();
	await page.getByLabel('Zoom in', { exact: true }).click();
	await page.getByLabel('Zoom in', { exact: true }).click();
	await expect.poll(() => page.locator('.scene img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1920);
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('detail is retained for an offline revisit', async ({ page, context }) => {
	await ready(page);
	await page.getByLabel('Zoom in', { exact: true }).click();
	await page.getByLabel('Zoom in', { exact: true }).click();
	await expect.poll(() => cached(page, '/maps/voyage-detail.webp')).toBe(true);
	await context.setOffline(true);
	await page.reload();
	await page.getByLabel('Zoom in', { exact: true }).click();
	await page.getByLabel('Zoom in', { exact: true }).click();
	await expect.poll(() => page.locator('.scene img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(3072);
	await expect(page.getByRole('alert')).toHaveCount(0);
});
