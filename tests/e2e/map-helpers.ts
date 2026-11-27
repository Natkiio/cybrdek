import { expect, type Page } from '@playwright/test';

export async function findPlace(page: Page, name: string) {
	await page.getByRole('button', { name: 'Find a place', exact: false }).click();
	const finder = page.getByRole('dialog', { name: 'Find a place', exact: true });
	await finder.getByRole('searchbox').fill(name);
	await finder.getByRole('button', { name, exact: true }).click();
	await expect(finder).not.toBeVisible();
}

export async function openLayers(page: Page) {
	if (!await page.getByRole('dialog', { name: 'Layers', exact: true }).isVisible()) {
		await page.getByRole('button', { name: 'LAYERS', exact: true }).click();
	}
}

export async function closeLayers(page: Page) {
	await page.getByRole('button', { name: 'Close Layers', exact: true }).click();
}

export async function expectMapFillsViewport(page: Page) {
	const viewport = (await page.getByRole('application', { name: /interactive map/ }).boundingBox())!;
	const image = (await page.locator('.scene img').boundingBox())!;
	expect(image.x).toBeLessThanOrEqual(viewport.x + 1);
	expect(image.y).toBeLessThanOrEqual(viewport.y + 1);
	expect(image.x + image.width).toBeGreaterThanOrEqual(viewport.x + viewport.width - 1);
	expect(image.y + image.height).toBeGreaterThanOrEqual(viewport.y + viewport.height - 1);
	const dock = (await page.locator('.dock').boundingBox())!;
	expect(dock.y + dock.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight) + 1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	for (const button of await page.locator('.map-page button:visible').all()) {
		const box = (await button.boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(44);
		expect(box.height).toBeGreaterThanOrEqual(44);
	}
}

/** Show Voyage City's original art rather than the default concept city (for tests of the image itself). */
export async function useOriginalArt(page: Page) {
	await page.addInitScript(() => localStorage.setItem('cybrdek:map:style:00000000-0000-4000-8000-000000000001', 'art'));
}
