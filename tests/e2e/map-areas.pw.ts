import { test, expect, type Page } from '@playwright/test';

test.use({ hasTouch: true });
const viewport = (page: Page) => page.getByRole('application', { name: /interactive map/ });
async function position(page: Page, x: number, y: number) {
	await viewport(page).scrollIntoViewIfNeeded();
	const box = (await page.locator('.scene').boundingBox())!;
	const image = page.locator('.scene img');
	const width = Number(await image.getAttribute('width')), height = Number(await image.getAttribute('height'));
	return { x: box.x + x * box.width / width, y: box.y + y * box.height / height };
}
async function point(page: Page, x: number, y: number, touch = false) {
	const p = await position(page, x, y);
	if (touch) await page.touchscreen.tap(p.x, p.y);
	else await page.mouse.click(p.x, p.y);
}
async function draw(page: Page, name: string, points: number[][], touch = false, kind = 'district') {
	await page.getByRole('button', { name: 'NEW AREA', exact: true }).click();
	await page.getByLabel('Area name', { exact: true }).fill(name);
	await page.getByLabel('Area kind', { exact: true }).selectOption(kind);
	for (const [x, y] of points) await point(page, x, y, touch);
}
async function edit(page: Page, name: string, kind = 'district') {
	await page.getByLabel('Edit area', { exact: true }).selectOption({ label: `${name} · ${kind}` });
}
async function save(page: Page, count: number) {
	await page.getByRole('button', { name: 'SAVE AREA', exact: true }).click();
	await expect(page.getByLabel('Area count')).toHaveText(String(count));
	await expect(page.getByRole('button', { name: 'SAVE AREA', exact: true })).toHaveCount(0);
}
async function remove(page: Page) {
	await page.getByRole('button', { name: 'DELETE AREA', exact: true }).click();
	await page.getByRole('button', { name: 'CONFIRM DELETE AREA', exact: true }).click();
}

test('mouse drawing, validation, vertex drag, renaming and cancellation on a generic map', async ({ page }, testInfo) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/map/areas');
	await expect(viewport(page)).toHaveAttribute('aria-label', 'Practice floorplan interactive map');
	await expect(page.locator('.scene img')).toHaveAttribute('width', '900');
	await draw(page, 'Market', [[100, 100], [700, 100]]);
	await page.getByRole('button', { name: 'SAVE AREA', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('at least 3');
	await expect(page.getByLabel('Area count')).toHaveText('0');
	await point(page, 700, 500); await point(page, 100, 500);
	await save(page, 1);
	await edit(page, 'Market');
	await page.getByLabel('Area name', { exact: true }).fill('Old Market');
	const before = await position(page, 100, 100), after = await position(page, 160, 160);
	await page.mouse.move(before.x, before.y); await page.mouse.down();
	await page.mouse.move(after.x, after.y, { steps: 8 }); await page.mouse.up();
	await expect(page.getByLabel('Point X', { exact: true })).toHaveValue(/15\d|16\d/);
	await save(page, 1);
	await edit(page, 'Old Market');
	await page.getByRole('button', { name: 'Point 2', exact: true }).click();
	await page.getByLabel('Point X', { exact: true }).fill('500');
	await page.getByLabel('Point X', { exact: true }).press('Tab');
	await page.getByRole('button', { name: 'CANCEL EDIT', exact: true }).click();
	await edit(page, 'Old Market');
	await page.getByRole('button', { name: 'Point 2', exact: true }).click();
	await expect(page.getByLabel('Point X', { exact: true })).toHaveValue(/69\d|70\d/);
	await viewport(page).scrollIntoViewIfNeeded();
	await page.screenshot({ path: testInfo.outputPath('area-editor-mobile.png') });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.setViewportSize({ width: 320, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(viewport(page)).toBeVisible();
	await remove(page);
	await expect(page.getByLabel('Area count')).toHaveText('0');
	expect(errors).toEqual([]);
});

test('touch drawing, tap-to-move, actual touch drag and safe district/ward reassignment', async ({ page, context }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/map/areas');
	await draw(page, 'North', [[50, 50], [800, 50], [800, 540], [50, 540]], true);
	await save(page, 1);
	await draw(page, 'South', [[500, 300], [850, 300], [850, 570], [500, 570]], true);
	await save(page, 2);
	await draw(page, 'Ward', [[200, 200], [400, 200], [400, 400], [200, 400]], true, 'ward');
	await page.getByRole('button', { name: 'SAVE AREA', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('existing district');
	await page.getByLabel('Ward district', { exact: true }).selectOption({ label: 'North' });
	await save(page, 3);
	await edit(page, 'Ward', 'ward');
	await page.getByRole('button', { name: 'Point 1', exact: true }).tap();
	await point(page, 240, 240, true);
	await expect(page.getByLabel('Point X', { exact: true })).toHaveValue(/23\d|24\d/);
	const from = await position(page, 240, 240), to = await position(page, 270, 260);
	const cdp = await context.newCDPSession(page);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x, y: to.y, id: 1 }] });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect(page.getByLabel('Point X', { exact: true })).toHaveValue(/26\d|27\d/);
	await save(page, 3);
	await edit(page, 'North');
	await remove(page);
	await expect(page.getByRole('alert')).toContainText('wards first');
	await expect(page.getByLabel('Area count')).toHaveText('3');
	await edit(page, 'Ward', 'ward');
	await page.getByLabel('Ward district', { exact: true }).selectOption({ label: 'South' });
	await save(page, 3);
	await edit(page, 'North'); await remove(page);
	await expect(page.getByLabel('Area count')).toHaveText('2');
	await edit(page, 'Ward', 'ward');
	await page.getByLabel('Area kind', { exact: true }).selectOption('district');
	await save(page, 2);
	await edit(page, 'South'); await remove(page);
	await expect(page.getByLabel('Area count')).toHaveText('1');
	expect(errors).toEqual([]);
});

test('Voyage uses the generic format; local image upload changes dimensions and resets edits', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/map/areas');
	await page.getByRole('button', { name: 'VOYAGE CITY', exact: true }).click();
	await expect(page.getByLabel('Area count')).toHaveText('13');
	await expect(page.locator('.scene img')).toHaveAttribute('width', '3840');
	await expect(page.getByLabel('Edit area', { exact: true }).locator('option')).toHaveCount(14);
	await edit(page, 'Nova Peak', 'ward');
	await expect(page.getByLabel('Ward district', { exact: true })).toHaveValue('west-ridge');
	await page.getByLabel('Open map image').setInputFiles({ name: 'portrait.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="800"><rect width="220" height="800" fill="white"/></svg>') });
	await expect(page.locator('.scene img')).toHaveAttribute('width', '220');
	await expect(page.locator('.scene img')).toHaveAttribute('height', '800');
	await expect(page.getByLabel('Area count')).toHaveText('0');
	await expect(page.getByRole('button', { name: 'SAVE AREA', exact: true })).toHaveCount(0);
	await draw(page, 'Portrait', [[20, 30], [180, 30], [180, 700]], true);
	await save(page, 1);
	await page.reload();
	await expect(page.getByLabel('Area count')).toHaveText('0');
	await expect(page.locator('.scene img')).toHaveAttribute('width', '900');
	await page.getByRole('button', { name: 'NEW AREA', exact: true }).click();
	await page.getByRole('button', { name: 'PRACTICE MAP', exact: true }).click();
	await expect(page.getByRole('button', { name: 'SAVE AREA', exact: true })).toHaveCount(0);
	expect(errors).toEqual([]);
});
