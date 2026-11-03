import { test, expect } from '@playwright/test';

// Lore pages offline (#38 follow-up). Supabase is blocked for the whole test,
// so nothing here depends on (or touches) the live database.
const entry = (title: string, slug: string, visible: boolean, body = '') => ({
	id: slug,
	slug,
	title,
	type: 'location',
	summary: `${title} summary`,
	body,
	visible,
	created_at: '',
	updated_at: ''
});

test('lore list and entry pages open offline from the on-device copy', async ({ page, context }) => {
	await context.route(/supabase\.co/, (route) => route.abort());
	await page.goto('/lore');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller)
			await new Promise<void>((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
			);
	});

	// What a player's device would have saved last time it was online. A hidden
	// entry is planted too: the app must never show one from the cache.
	await page.evaluate(
		(entries) => localStorage.setItem('cybrdek.lore.v1', JSON.stringify(entries)),
		[
			entry('Araki', 'araki', true, 'Home turf of [[Gecko]] and [[Bowetown|the slums]].'),
			entry('Bowetown', 'bowetown', true),
			entry('Secret Plan', 'secret-plan', false)
		]
	);

	await context.setOffline(true);

	// An entry page this browser has never opened: served from the lore shell.
	await page.goto('/lore/araki');
	await expect(page.getByRole('heading', { name: 'Araki' })).toBeVisible();
	await expect(page.getByText('OFFLINE: showing the copy saved on this device.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'the slums' })).toHaveAttribute('href', '/lore/bowetown');
	await expect(page.getByRole('link', { name: 'Gecko' })).toHaveCount(0); // not known → plain text

	await page.goto('/lore');
	await expect(page.getByRole('link', { name: /Bowetown/ })).toBeVisible();
	await expect(page.getByText('Secret Plan')).toHaveCount(0);

	await page.goto('/gm');
	await expect(page.getByRole('heading', { name: 'GM ACCESS' })).toBeVisible();
});
