import { test, expect, type Page, type Route } from '@playwright/test';

// Password login. Supabase is faked, so this checks the app's side: what it
// sends and where it takes you. No email is involved for players (#65).
const MINE = 'c0000000-0000-4000-8000-000000000002';

interface Fake {
	accounts: Record<string, string>;
	joined: string[];
	passwords: string[];
	magicLinks: number;
}

const session = (email: string) => {
	const user = { id: 'u1', aud: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '' };
	return { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
};

async function fakeSupabase(page: Page, fake: Fake) {
	await page.context().route(/supabase\.co/, async (route: Route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname;
		const body = JSON.parse(req.postData() ?? '{}');
		const json = (value: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
		const fail = (code: string, msg: string, status: number) => json({ code: status, error_code: code, msg }, status);
		if (path.endsWith('/auth/v1/signup')) {
			if (fake.accounts[body.email]) return fail('user_already_exists', 'User already registered', 422);
			fake.accounts[body.email] = body.password;
			return json(session(body.email));
		}
		if (path.endsWith('/auth/v1/token')) {
			if (fake.accounts[body.email] !== body.password) return fail('invalid_credentials', 'Invalid login credentials', 400);
			return json(session(body.email));
		}
		if (path.endsWith('/auth/v1/user')) {
			fake.passwords.push(body.password);
			return json(session('gm@example.com').user);
		}
		if (path.endsWith('/auth/v1/otp')) {
			fake.magicLinks++;
			return json({});
		}
		if (path.endsWith('/rpc/is_campaign_gm')) return json(false);
		if (path.endsWith('/rpc/join_campaign')) {
			fake.joined.push(body.invite_code);
			return json(MINE);
		}
		if (path.endsWith('/campaigns')) return json({ id: MINE, name: 'Friend Game', is_public: false });
		return json([]);
	});
}

const fresh = (accounts: Record<string, string> = {}): Fake => ({ accounts, joined: [], passwords: [], magicLinks: 0 });

async function fill(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
}

test('a new player creates an account from an invite and joins, with no email', async ({ page }) => {
	const fake = fresh();
	await fakeSupabase(page, fake);
	await page.goto('/join/abc123');
	await expect(page.getByRole('button', { name: /email me a link/i })).toHaveCount(0);
	await page.getByRole('button', { name: 'Create an account' }).click();
	await fill(page, 'player@example.com', 'long-enough');
	await page.getByRole('button', { name: 'CREATE ACCOUNT' }).click();

	await expect(page).toHaveURL(/\/campaigns$/);
	await expect(page.getByRole('link', { name: 'CAMPAIGN: Friend Game' })).toBeVisible();
	expect(fake.accounts['player@example.com']).toBe('long-enough');
	expect(fake.joined).toEqual(['abc123']);
	expect(fake.magicLinks).toBe(0);
});

test('a returning player signs in; a wrong password says so and joins nothing', async ({ page }) => {
	const fake = fresh({ 'player@example.com': 'right-password' });
	await fakeSupabase(page, fake);
	await page.goto('/join/abc123');
	await fill(page, 'player@example.com', 'wrong-password');
	await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
	expect(fake.joined).toEqual([]);

	await fill(page, 'player@example.com', 'right-password');
	await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
	await expect(page).toHaveURL(/\/campaigns$/);
	expect(fake.joined).toEqual(['abc123']);
});

test('an email that already has an account is told to sign in', async ({ page }) => {
	await fakeSupabase(page, fresh({ 'player@example.com': 'right-password' }));
	await page.goto('/gm');
	await page.getByRole('button', { name: 'Create an account' }).click();
	await fill(page, 'player@example.com', 'another-password');
	await page.getByRole('button', { name: 'CREATE ACCOUNT' }).click();
	await expect(page.getByRole('alert')).toContainText('already has an account');
});

test('the GM keeps the email link, then can set a password', async ({ page }) => {
	const fake = fresh({ 'gm@example.com': 'old-password' });
	await fakeSupabase(page, fake);
	await page.goto('/gm');
	await page.getByLabel('Email').fill('gm@example.com');
	await page.getByRole('button', { name: 'GM: email me a link' }).click();
	await expect(page.getByText('Link sent.')).toBeVisible();
	expect(fake.magicLinks).toBe(1);

	await fill(page, 'gm@example.com', 'old-password');
	await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
	await page.getByLabel('New password').fill('a-new-password');
	await page.getByRole('button', { name: 'SET PASSWORD' }).click();
	await expect(page.getByText('Password saved.')).toBeVisible();
	expect(fake.passwords).toEqual(['a-new-password']);
});
