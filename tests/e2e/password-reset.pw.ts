import { test, expect, type Page, type Route } from '@playwright/test';

// Forgotten passwords: the admin makes a code on /gm, the player enters it
// when signing in. Supabase is faked; tests/db/password-resets.test.ts and
// tests/functions/reset-password.test.ts cover the real checks.

interface Fake {
	accounts: Record<string, string>;
	admin: boolean;
	codes: Record<string, string>; // email -> live code
	issued: string[];
}

const session = (email: string) => {
	const user = { id: 'u1', aud: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '' };
	return { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
};

async function fakeSupabase(page: Page, fake: Fake, signedInAs?: string) {
	await page.context().route(/supabase\.co/, async (route: Route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname;
		const body = JSON.parse(req.postData() ?? '{}');
		const json = (value: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value), headers: { 'Access-Control-Allow-Origin': '*' } });
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
		if (path.endsWith('/auth/v1/token')) {
			if (fake.accounts[body.email] !== body.password) return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
			return json(session(body.email));
		}
		if (path.endsWith('/rpc/is_gm')) return json(fake.admin);
		if (path.endsWith('/rpc/issue_password_reset')) {
			if (!fake.admin) return json({ code: '42501', message: 'Only the app admin can issue reset codes.' }, 403);
			if (!fake.accounts[body.player_email]) return json({ code: 'P0002', message: 'No account uses that email.' }, 400);
			fake.codes[body.player_email] = '3F9A-0C21-B7E4';
			fake.issued.push(body.player_email);
			return json('3F9A-0C21-B7E4');
		}
		if (path.endsWith('/functions/v1/reset-password')) {
			if (fake.codes[body.email] !== body.code) return json({ error: "That code didn't work. Ask for a new one." }, 400);
			delete fake.codes[body.email];
			fake.accounts[body.email] = body.password;
			return json({ ok: true });
		}
		if (path.endsWith('/rpc/is_campaign_gm')) return json(false);
		return json([]);
	});
	if (signedInAs) {
		await page.addInitScript((value) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.setItem('sb-hntlvhspyllaaidvxlox-auth-token', JSON.stringify(value));
		}, session(signedInAs));
	}
}

test('the admin makes a code; the player uses it to set a new password and is signed in', async ({ browser }) => {
	const fake: Fake = { accounts: { 'player@example.com': 'forgotten', 'gm@example.com': 'gm-pass' }, admin: true, codes: {}, issued: [] };

	const gmPage = await (await browser.newContext()).newPage();
	await fakeSupabase(gmPage, fake, 'gm@example.com');
	await gmPage.goto('/gm');
	const panel = gmPage.locator('section.panel').filter({ hasText: 'PASSWORD RESET CODES' });
	await panel.getByLabel("Player's email").fill('nobody@example.com');
	await panel.getByRole('button', { name: 'MAKE CODE' }).click();
	await expect(panel.getByRole('alert')).toHaveText('No account uses that email.');
	await panel.getByLabel("Player's email").fill('player@example.com');
	await panel.getByRole('button', { name: 'MAKE CODE' }).click();
	await expect(panel.getByText('3F9A-0C21-B7E4')).toBeVisible();

	const playerPage = await (await browser.newContext()).newPage();
	await fakeSupabase(playerPage, fake);
	await playerPage.goto('/gm');
	await playerPage.getByRole('button', { name: 'Forgot password?' }).click();
	await playerPage.getByLabel('Email').fill('player@example.com');
	await playerPage.getByLabel('Reset code').fill('0000-0000-0000');
	await playerPage.getByLabel('New password').fill('brand-new-pass');
	await playerPage.getByRole('button', { name: 'SET NEW PASSWORD' }).click();
	await expect(playerPage.getByRole('alert')).toContainText("didn't work");
	expect(fake.accounts['player@example.com']).toBe('forgotten');

	await playerPage.getByLabel('Reset code').fill('3F9A-0C21-B7E4');
	await playerPage.getByRole('button', { name: 'SET NEW PASSWORD' }).click();
	await expect(playerPage.getByText('Signed in as')).toBeVisible();
	expect(fake.accounts['player@example.com']).toBe('brand-new-pass');
});

test('players never see the reset-code panel', async ({ page }) => {
	const fake: Fake = { accounts: { 'player@example.com': 'pw' }, admin: false, codes: {}, issued: [] };
	await fakeSupabase(page, fake, 'player@example.com');
	await page.goto('/gm');
	await expect(page.getByText('Signed in as')).toBeVisible();
	await page.waitForTimeout(300);
	await expect(page.getByText('PASSWORD RESET CODES')).toHaveCount(0);
});

test('a short new password is caught before anything is sent', async ({ page }) => {
	const fake: Fake = { accounts: {}, admin: false, codes: { 'p@example.com': '3F9A-0C21-B7E4' }, issued: [] };
	await fakeSupabase(page, fake);
	await page.goto('/gm');
	await page.getByRole('button', { name: 'Forgot password?' }).click();
	await page.getByLabel('Email').fill('p@example.com');
	await page.getByLabel('Reset code').fill('3F9A-0C21-B7E4');
	await page.getByLabel('New password').fill('short');
	await page.getByRole('button', { name: 'SET NEW PASSWORD' }).click();
	expect(await page.getByLabel('New password').evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);
	expect(fake.codes['p@example.com']).toBe('3F9A-0C21-B7E4');
});
