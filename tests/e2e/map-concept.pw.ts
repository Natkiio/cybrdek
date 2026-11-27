import { test, expect } from '@playwright/test';
import { findPlace, openLayers, closeLayers } from './map-helpers.ts';
import { DISTRICTS } from '../../src/lib/map/districts.ts';

// The concept city (Nathan, 27 Nov): a generated map in the mockup style, drawn
// from the districts and wards. Voyage City opens with it; the art is a switch away.
test.beforeEach(async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
});

test('Voyage City opens as the concept city, drawn from its districts and wards', async ({ page }) => {
	await page.goto('/map');
	const city = page.locator('.scene g.concept');
	await expect(city).toBeVisible();
	await expect(page.locator('.scene img')).toHaveCount(0);
	await expect(page.locator('.hud')).toContainText('VOYAGE CITY');
	const districts = DISTRICTS.filter((d) => d.kind === 'district');
	const wards = DISTRICTS.filter((d) => d.kind === 'ward');
	await expect(city.locator('polygon.edge')).toHaveCount(districts.length);
	await expect(city.locator('polygon.ward-edge')).toHaveCount(wards.length);
	await expect(city.locator('text.district-name', { hasText: 'CENTRAL POINT' })).toHaveCount(1);
	await expect(city.locator('text.ward-name', { hasText: 'ASHGREENE' })).toHaveCount(1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

	// A district lights up when found, with its wards; the card lists them.
	await findPlace(page, 'Central Point');
	await expect(city.locator('polygon.edge.on')).toHaveCount(1);
	await expect(city.locator('polygon.ward-edge.on')).toHaveCount(wards.filter((w) => w.parentId === 'central-point').length);
	await expect(page.getByLabel('Selected district')).toContainText('Ashgreene');
});

test('LAYERS switches to the original art and back, per campaign, remembered', async ({ page }) => {
	await page.goto('/map');
	await openLayers(page);
	await expect(page.getByLabel('Concept city')).toBeChecked();
	await expect(page.getByLabel('District outlines')).toHaveCount(0);
	await page.getByLabel('Original art').check();
	await expect(page.getByLabel('District outlines')).toBeVisible();
	await closeLayers(page);
	await expect(page.locator('.scene img')).toBeVisible();
	await expect(page.locator('.scene g.concept')).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.scene img')).toBeVisible();
	await openLayers(page);
	await page.getByLabel('Concept city').check();
	await closeLayers(page);
	await expect(page.locator('.scene g.concept')).toBeVisible();
});
