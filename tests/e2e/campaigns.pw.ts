import { test, expect, type Page, type Route } from '@playwright/test';

// Campaigns (#60). Supabase is faked, so this checks the app's side: which
// campaign it asks for and how it moves between them. Tests that the database
// itself keeps campaigns apart are in tests/db/campaigns.test.ts.
const VOYAGE = '00000000-0000-4000-8000-000000000001';
const REF = 'hntlvhspyllaaidvxlox';
const MINE = 'c0000000-0000-4000-8000-000000000002';

interface Fake {
	campaigns: { id: string; name: string; is_public: boolean }[];
	members: { campaign_id: string; role: string }[];
	gmOf: string[];
	loreRequests: string[];
	loreInserts: Record<string, unknown>[];
	joined: string[];
}

async function fakeSupabase(page: Page, fake: Fake) {
	await page.context().route(/supabase\.co/, async (route: Route) => {
		const req = route.request();
		const url = new URL(req.url());
		const json = (body: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		const path = url.pathname;
		if (path.endsWith('/rpc/is_campaign_gm')) return json(fake.gmOf.includes(JSON.parse(req.postData() ?? '{}').campaign));
		if (path.endsWith('/rpc/create_campaign')) {
			const name = JSON.parse(req.postData() ?? '{}').campaign_name;
			fake.campaigns.push({ id: MINE, name, is_public: false });
			fake.members.push({ campaign_id: MINE, role: 'gm' });
			fake.gmOf.push(MINE);
			return json(MINE);
		}
		if (path.endsWith('/rpc/join_campaign')) {
			fake.joined.push(JSON.parse(req.postData() ?? '{}').invite_code);
			fake.campaigns.push({ id: MINE, name: 'Friend Game', is_public: false });
			return json(MINE);
		}
		if (path.endsWith('/campaign_invites')) return json({ code: 'secret-code' });
		if (path.endsWith('/campaign_members')) return json(fake.members);
		if (path.endsWith('/campaigns')) {
			const single = req.headers().accept?.includes('vnd.pgrst.object');
			return json(single ? fake.campaigns.at(-1) : fake.campaigns);
		}
		if (path.endsWith('/lore_entries')) {
			if (req.method() === 'GET') {
				fake.loreRequests.push(url.searchParams.get('campaign_id') ?? '');
				return json([]);
			}
			const row = { id: 'e1', summary: '', body: '', created_at: '', updated_at: '', ...JSON.parse(req.postData() ?? '{}') };
			fake.loreInserts.push(row);
			return json(row, 201);
		}
		return json([]);
	});
}

async function signedIn(page: Page) {
	await page.addInitScript((ref) => {
		const now = Math.floor(Date.now() / 1000);
		localStorage.setItem(
			`sb-${ref}-auth-token`,
			JSON.stringify({
				access_token: 'test-token',
				refresh_token: 'test-refresh',
				token_type: 'bearer',
				expires_in: 3600,
				expires_at: now + 3600,
				user: { id: 'u1', aud: 'authenticated', email: 'gm@example.com', app_metadata: {}, user_metadata: {}, created_at: '' }
			})
		);
	}, REF);
}

const fresh = (): Fake => ({
	campaigns: [{ id: VOYAGE, name: 'Voyage City', is_public: true }],
	members: [],
	gmOf: [],
	loreRequests: [],
	loreInserts: [],
	joined: []
});

test('no account: Voyage City is the default, and creating needs sign-in', async ({ page }) => {
	const fake = fresh();
	await fakeSupabase(page, fake);
	await page.goto('/lore');
	await expect(page.getByRole('link', { name: 'CAMPAIGN: Voyage City' })).toBeVisible();
	await expect.poll(() => fake.loreRequests.at(-1)).toBe(`eq.${VOYAGE}`);
	await page.goto('/campaigns');
	await expect(page.getByRole('button', { name: /Voyage City/ })).toContainText('CURRENT');
	await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
	await expect(page.getByLabel('Campaign name')).toHaveCount(0);
	await expect(page.getByLabel('Invite link')).toHaveCount(0);
});

test('create a campaign: become its GM, get an invite, everything is scoped to it', async ({ page }) => {
	const fake = fresh();
	await fakeSupabase(page, fake);
	await signedIn(page);
	await page.goto('/campaigns');
	await page.getByLabel('Campaign name').fill('The Long Night');
	await page.getByRole('button', { name: 'CREATE' }).click();

	await expect(page.getByRole('link', { name: 'CAMPAIGN: The Long Night' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'GM MODE' })).toBeVisible();
	await expect(page.getByLabel('Invite link')).toHaveValue(/\/join\/secret-code$/);

	// Lore reads and writes go to this campaign.
	await page.goto('/lore/new');
	await page.getByRole('textbox').first().fill('Rooftop');
	await page.getByRole('button', { name: 'SAVE' }).click();
	await expect.poll(() => fake.loreInserts.length).toBe(1);
	expect(fake.loreInserts[0].campaign_id).toBe(MINE);
	await page.goto('/lore');
	await expect.poll(() => fake.loreRequests.at(-1)).toBe(`eq.${MINE}`);

	// It has no map yet, and doesn't show Voyage City's.
	await page.goto('/map');
	await expect(page.getByText("This campaign doesn't have a map yet.")).toBeVisible();
	await expect(page.locator('.scene img')).toHaveCount(0);

	// Switching back works.
	await page.goto('/campaigns');
	await page.getByRole('button', { name: /Voyage City/ }).click();
	await expect(page.getByRole('link', { name: 'CAMPAIGN: Voyage City' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'GM MODE' })).toHaveCount(0);
});

test('an invite link: asks you to sign in, then joins and switches', async ({ page, context }) => {
	const fake = fresh();
	await fakeSupabase(page, fake);
	await page.goto('/join/abc123');
	await expect(page.getByText("You've been invited to a campaign.")).toBeVisible();
	expect(fake.joined).toEqual([]);

	await signedIn(page);
	await page.goto('/join/abc123');
	await expect(page).toHaveURL(/\/lore$/);
	await expect(page.getByRole('link', { name: 'CAMPAIGN: Friend Game' })).toBeVisible();
	expect(fake.joined).toEqual(['abc123']);
	await context.clearCookies();
});
