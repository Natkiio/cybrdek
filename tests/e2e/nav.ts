import { expect, type Page } from '@playwright/test';

/** Go to a section the way a person would: on a phone the links sit in the menu (#101). */
export async function goToSection(page: Page, label: string) {
	const menu = page.getByRole('button', { name: 'Menu', exact: true });
	if (await menu.isVisible()) await menu.click();
	const link = page.getByRole('link', { name: label, exact: true });
	const href = (await link.getAttribute('href')) ?? '/';
	await link.click();
	// Arrived, and the menu has closed behind us.
	await page.waitForURL((url) => (href === '/' ? url.pathname === '/' : url.pathname.startsWith(href)));
	await expect(page.getByRole('button', { name: 'Close menu' })).toHaveCount(0);
}
