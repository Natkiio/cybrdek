import { test, expect } from '@playwright/test';
import { findPlace, openLayers, closeLayers } from './map-helpers.ts';
import { DISTRICTS } from '../../src/lib/map/districts.ts';

// The simple schematic city (#101, mockup A): drawn from the traced district
// shapes instead of the map image, and on by default for Voyage City.
test.beforeEach(async ({ page }) => {
	await page.context().route(/supabase\.co/, (route) => route.abort());
});

test('Voyage City opens as the simple map: shapes and labels, no image', async ({ page }) => {
	await page.goto('/map');
	const scene = page.locator('.scene');
	await expect(scene.locator('svg.schematic')).toBeVisible();
	// The art stays underneath as remapped texture (grey blocks, red streets), not as the picture itself.
	await expect(scene.locator('img.texture')).toHaveCount(1);
	expect(await scene.locator('img.texture').evaluate((img) => getComputedStyle(img).filter)).toMatch(/url\(/);
	await expect(page.locator('.hud')).toContainText('VOYAGE CITY');
	const districts = DISTRICTS.filter((d) => d.kind === 'district');
	await expect(scene.locator('polygon.land')).toHaveCount(districts.length);
	await expect(scene.locator('text.label', { hasText: 'WEST RIDGE' })).toHaveCount(1);
	// The drawing fills the space under the header, above the dock.
	const viewport = (await page.getByRole('application', { name: /interactive map/ }).boundingBox())!;
	const svg = (await scene.locator('svg.schematic').boundingBox())!;
	expect(svg.x).toBeLessThanOrEqual(viewport.x + 1);
	expect(svg.x + svg.width).toBeGreaterThanOrEqual(viewport.x + viewport.width - 1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

	// Picking a district lights it up and opens its card.
	await findPlace(page, 'West Ridge');
	await expect(page.getByLabel('Selected district')).toContainText('West Ridge');
	await expect(scene.locator('polygon.selected')).toHaveCount(1);
});

test('LAYERS switches to the detailed art, and the choice is remembered', async ({ page }) => {
	await page.goto('/map');
	await openLayers(page);
	const simple = page.getByLabel('Simple map (districts only)');
	await expect(simple).toBeChecked();
	await expect(page.getByLabel('District outlines')).toHaveCount(0); // only for the art
	await simple.uncheck();
	await expect(page.getByLabel('District outlines')).toBeVisible();
	await closeLayers(page);
	await expect(page.locator('.scene img')).toBeVisible();
	await expect(page.locator('.scene img.texture')).toHaveCount(0); // the art itself, unfiltered
	await expect(page.locator('.scene svg.schematic')).toHaveCount(0);

	await page.reload();
	await expect(page.locator('.scene img:not(.texture)')).toBeVisible();
	await openLayers(page);
	await page.getByLabel('Simple map (districts only)').check();
	await closeLayers(page);
	await expect(page.locator('.scene svg.schematic')).toBeVisible();
});
