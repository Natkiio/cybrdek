import { test, expect } from '@playwright/test';
import { fakePdf } from '../fixtures/fake-pdf.ts';

// Only fictional bytes ever enter this test browser. No personal rulebook is used.
const fixture = { name: 'fictional-manual.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fakePdf()) };

test('local PDF survives offline reload, uses cached worker, searches/navigates and removes', async ({ page, context }, testInfo) => {
	const requests: { url: string; method: string }[] = [];
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	context.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
	await page.goto('/rules');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
	});
	await page.getByLabel('CHOOSE PDF').setInputFiles(fixture);
	await expect(page.getByText('fictional-manual.pdf · 3 PDF pages')).toBeVisible();
	await expect(page.locator('.viewport')).toHaveAttribute('aria-busy', 'false');
	await expect(page.locator('canvas')).toBeVisible();
	await page.getByLabel('Search rulebook').fill('violet engine');
	await page.getByRole('button', { name: 'SEARCH', exact: true }).click();
	await page.getByRole('button', { name: /PAGE 2 Clockwork/ }).click();
	await expect(page.getByLabel('PDF page number')).toHaveValue('2');
	await page.getByText('PAGE 2 TEXT', { exact: true }).click();
	await expect(page.locator('pre')).toContainText('Clockwork otters');

	// A bad replacement must not erase a good stored book or its index.
	await page.getByLabel('REPLACE PDF').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
	await expect(page.getByRole('alert')).toContainText('previous book is unchanged');
	await expect(page.getByText('fictional-manual.pdf · 3 PDF pages')).toBeVisible();

	const cachedAssets = await page.evaluate(async () => {
		const cache = await caches.open((await caches.keys()).find((key) => key.startsWith('cybrdek-'))!);
		return (await cache.keys()).map((request) => request.url);
	});
	expect(cachedAssets.some((url) => /pdf\.worker.*\.mjs/.test(url))).toBe(true);
	expect(cachedAssets.some((url) => /openjpeg.*\.wasm/.test(url))).toBe(true);
	expect(cachedAssets.some((url) => /LiberationSans-Regular/.test(url))).toBe(true);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByText('fictional-manual.pdf · 3 PDF pages')).toBeVisible();
	await expect(page.getByLabel('PDF page number')).toHaveValue('2');
	await expect(page.locator('.viewport')).toHaveAttribute('aria-busy', 'false');
	await expect(page.getByRole('alert')).toHaveCount(0);
	const painted = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
		const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
		return pixels.some((value, i) => i % 4 !== 3 && value < 200);
	});
	expect(painted).toBe(true);
	await page.getByLabel('Search rulebook').fill('umbrella museum');
	await page.getByRole('button', { name: 'SEARCH', exact: true }).click();
	await page.getByRole('button', { name: /PAGE 3 The umbrella/ }).click();
	await expect(page.getByLabel('PDF page number')).toHaveValue('3');
	await page.getByLabel('Previous page').click();
	await expect(page.getByLabel('PDF page number')).toHaveValue('2');
	await page.getByLabel('PDF page number').fill('1');
	await page.getByRole('button', { name: 'GO', exact: true }).click();
	await expect(page.getByLabel('PDF page number')).toHaveValue('1');
	await page.getByLabel('Zoom in').click();
	await expect(page.getByText('150% · fit width at 100%')).toBeVisible();
	await expect(page.locator('.viewport')).toHaveAttribute('aria-busy', 'false');
	// The page scrolls inside the viewer at zoom, without overflowing the phone viewport.
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: testInfo.outputPath('rulebook-mobile.png'), fullPage: true });
	await page.getByRole('button', { name: 'REMOVE STORED BOOK' }).click();
	await page.getByRole('button', { name: 'YES, REMOVE' }).click();
	await expect(page.getByLabel('CHOOSE PDF')).toBeVisible();
	await page.reload();
	await expect(page.getByLabel('CHOOSE PDF')).toBeEnabled();
	await expect(page.locator('canvas')).toHaveCount(0);
	expect(requests.every(({ url, method }) => method === 'GET' && (url.startsWith('http://127.0.0.1:4178/') || url.startsWith('data:') || url.startsWith('blob:')))).toBe(true);
	expect(errors).toEqual([]);
});
