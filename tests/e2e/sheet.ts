import { expect, type Page } from '@playwright/test';

/** Open a folded sheet section (#101) if it's closed. Folds stay open across reloads. */
export async function openFold(page: Page, title: string) {
	const fold = page.locator('details.fold').filter({ has: page.locator('summary .title', { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
	if ((await fold.getAttribute('open')) === null) await fold.locator('summary').click();
	await expect(fold).toHaveAttribute('open', '');
}

/** Open the HP panel's damage form (attack type, location, amount). */
export async function openDamageForm(page: Page) {
	// Wait for the HP panel first: right after a load the form isn't drawn yet.
	const toggle = page.getByRole('button', { name: /^(DAMAGE \/ HEAL…|CLOSE)$/ });
	await expect(toggle).toBeVisible();
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(page.getByLabel('Attack type')).toBeVisible();
}
