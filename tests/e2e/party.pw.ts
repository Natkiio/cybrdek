import { test, expect, type Page, type Route } from '@playwright/test';

// A player picks a character for a campaign, and the GM sees the party (#52).
// Supabase is faked; the rules behind this are in tests/db/characters.test.ts.
const REF = 'hntlvhspyllaaidvxlox';
const GAME = 'c0000000-0000-4000-8000-000000000002';

const sheet = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
	id,
	name,
	rulesetId: 'cyberpunk-red',
	stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 },
	skills: {},
	extra: { role: 'solo', roleRank: 4, ...extra }
});

interface Row {
	id: string;
	user_id: string;
	data: unknown;
	updated_at: number;
	deleted_at: null;
	campaign_id: string | null;
}

async function setup(page: Page, opts: { user: string; role: 'gm' | 'player'; rows: Row[] }) {
	const placed: { id: string; campaign: string | null }[] = [];
	await page.context().route(/supabase\.co/, async (route: Route) => {
		const req = route.request();
		const url = new URL(req.url());
		const path = url.pathname;
		const body = JSON.parse(req.postData() ?? '{}');
		const json = (value: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
		if (path.endsWith('/rpc/is_campaign_gm')) return json(opts.role === 'gm');
		if (path.endsWith('/rpc/set_character_campaign')) {
			placed.push({ id: body.character_id, campaign: body.campaign });
			const row = opts.rows.find((r) => r.id === body.character_id);
			if (row) row.campaign_id = body.campaign;
			return json(null);
		}
		if (path.endsWith('/rest/v1/characters')) {
			const inCampaign = url.searchParams.get('campaign_id');
			return json(opts.rows.filter((r) => (inCampaign ? `eq.${r.campaign_id}` === inCampaign : r.user_id === opts.user)));
		}
		if (path.endsWith('/campaign_members')) return json([{ campaign_id: GAME, role: opts.role }]);
		if (path.endsWith('/campaign_invites')) return json({ code: 'secret-code' });
		if (path.endsWith('/campaigns')) return json([{ id: GAME, name: 'Friend Game', is_public: false }]);
		return json(path.includes('/auth/') ? {} : []);
	});
	await page.addInitScript(
		([ref, id, game]) => {
			localStorage.setItem('cybrdek:campaign', JSON.stringify({ id: game, name: 'Friend Game' }));
			localStorage.setItem(
				`sb-${ref}-auth-token`,
				JSON.stringify({
					access_token: 'test-token',
					refresh_token: 'refresh',
					token_type: 'bearer',
					expires_in: 3600,
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					user: { id, aud: 'authenticated', email: 'someone@example.com', app_metadata: {}, user_metadata: {}, created_at: '' }
				})
			);
		},
		[REF, opts.user, GAME]
	);
	return placed;
}

const row = (user_id: string, id: string, name: string, campaign_id: string | null = null, extra = {}): Row => ({
	id,
	user_id,
	data: sheet(id, name, extra),
	updated_at: 1000,
	deleted_at: null,
	campaign_id
});

test('a player picks a character, and can take it back out', async ({ page }) => {
	const placed = await setup(page, { user: 'p1', role: 'player', rows: [row('p1', 'v', 'Vex'), row('p1', 'k', 'Kit')] });
	await page.goto('/campaigns');
	const panel = page.locator('section.panel').filter({ hasText: 'YOUR CHARACTER' });
	await expect(panel.getByText('Vex')).toBeVisible();
	await expect(panel.getByText('Your GM will see their sheet')).toBeVisible();
	await expect(page.getByText('THE PARTY')).toHaveCount(0);

	await panel.locator('.row').filter({ hasText: 'Vex' }).getByRole('button', { name: 'PLAY THIS CHARACTER' }).click();
	await expect(panel.getByRole('button', { name: 'TAKE OUT' })).toBeVisible();
	expect(placed).toEqual([{ id: 'v', campaign: GAME }]);

	await panel.getByRole('button', { name: 'TAKE OUT' }).click();
	await expect(panel.getByRole('button', { name: 'TAKE OUT' })).toHaveCount(0);
	expect(placed.at(-1)).toEqual({ id: 'v', campaign: null });
});

test('a player with no characters is told how to get one', async ({ page }) => {
	await setup(page, { user: 'p1', role: 'player', rows: [] });
	await page.goto('/campaigns');
	await expect(page.getByRole('link', { name: 'Make one' })).toBeVisible();
});

test('the GM sees the party with HP and IP, and no picker', async ({ page }) => {
	await setup(page, {
		user: 'gm',
		role: 'gm',
		rows: [row('p1', 'v', 'Vex', GAME, { currentHp: 12, ip: 40 }), row('p2', 'k', 'Kit', GAME)]
	});
	await page.goto('/campaigns');
	const panel = page.locator('section.panel').filter({ hasText: 'THE PARTY' });
	const vex = panel.locator('li').filter({ hasText: 'Vex' });
	await expect(vex).toContainText('Solo 4');
	await expect(vex).toContainText(/HP 12\/\d+/);
	await expect(vex).toContainText('40 IP');
	await expect(panel.locator('li').filter({ hasText: 'Kit' })).toBeVisible();
	await expect(page.getByText('YOUR CHARACTER')).toHaveCount(0);
});

test('joining from an invite lands on the picker', async ({ page }) => {
	await setup(page, { user: 'p1', role: 'player', rows: [row('p1', 'v', 'Vex')] });
	await page.goto('/join/abc123');
	await expect(page.getByLabel('Campaign display name')).toHaveValue('');
	await page.getByRole('button', { name: 'SKIP FOR NOW' }).click();
	await expect(page).toHaveURL(/\/campaigns$/);
	await expect(page.getByRole('button', { name: 'PLAY THIS CHARACTER' })).toBeVisible();
});
