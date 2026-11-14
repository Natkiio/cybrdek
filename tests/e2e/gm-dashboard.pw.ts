import { test, expect, type Page, type Route } from '@playwright/test';

// The live GM dashboard (#53). Supabase is faked; who may read what is tested
// on real Postgres in tests/db/characters.test.ts. Realtime isn't faked here:
// the page also refetches when the tab becomes visible, which these tests use.
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
	let reads = 0;
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
			if (url.searchParams.get('campaign_id')) reads++;
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
	return { placed, reads: () => reads };
}

const row = (user_id: string, id: string, name: string, campaign_id: string | null = null, extra = {}): Row => ({
	id,
	user_id,
	data: sheet(id, name, extra),
	updated_at: 1000,
	deleted_at: null,
	campaign_id
});


const hurt = {
	currentHp: 10,
	gear: [{ id: 'k', kind: 'armor', name: 'Kevlar', sp: 7, location: 'both' }],
	criticalInjuries: [{ location: 'body', roll: 5 }],
	cyberware: []
};

test('the GM sees each character live: HP, wound, SP, STATs and injuries, and can open the whole sheet', async ({ page }) => {
	const rows = [
		row('p1', 'v', 'Vex', GAME, hurt),
		{ ...row('p2', 'm', 'Moss', GAME), data: { ...sheet('m', 'Moss'), skills: { handgun: 4, athletics: 2 } } }
	];
	await setup(page, { user: 'gm', role: 'gm', rows });
	await page.goto('/campaigns/party');
	const vex = page.locator('article.card').filter({ hasText: 'Vex' });
	await expect(vex).toContainText('HP 10/40');
	await expect(vex).toContainText('Seriously Wounded');
	await expect(vex).toContainText('SP head 7 · body 7');
	await expect(vex).toContainText('Broken Ribs');
	await expect(vex).toContainText('REF 7');
	await expect(page.locator('p.status')).toContainText('2 characters');

	const moss = page.locator('article.card').filter({ hasText: 'Moss' });
	await moss.getByRole('button', { name: /Moss/ }).click();
	await expect(moss.getByText('Handgun')).toBeVisible();
	await expect(moss.getByText('No gear.')).toBeVisible();
	// Read-only: no inputs or editing controls inside the opened sheet.
	await expect(moss.locator('input, select, textarea')).toHaveCount(0);
	await expect(moss.getByRole('button')).toHaveCount(1); // just the header that opens and closes it
});

test('changes reach the dashboard without a reload', async ({ page }) => {
	const rows = [row('p1', 'v', 'Vex', GAME)];
	const fake = await setup(page, { user: 'gm', role: 'gm', rows });
	await page.goto('/campaigns/party');
	await expect(page.locator('article.card')).toContainText('Unhurt');
	rows[0].data = sheet('v', 'Vex', { currentHp: 0 });
	rows.push(row('p2', 'n', 'Newcomer', GAME));
	const before = fake.reads();
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect(page.locator('article.card').filter({ hasText: 'Vex' })).toContainText('Mortally Wounded');
	await expect(page.locator('article.card').filter({ hasText: 'Newcomer' })).toBeVisible();
	expect(fake.reads()).toBeGreaterThan(before);
});

test('a player of the campaign gets no dashboard and asks for no characters', async ({ page }) => {
	const fake = await setup(page, { user: 'p1', role: 'player', rows: [row('p2', 'm', 'Moss', GAME)] });
	await page.goto('/campaigns/party');
	await expect(page.getByText("Only this campaign's GM can see the party dashboard.")).toBeVisible();
	await page.waitForTimeout(300);
	await expect(page.getByText('Moss')).toHaveCount(0);
	expect(fake.reads()).toBe(0);
});

test('the GM reaches the dashboard from the party panel', async ({ page }) => {
	await setup(page, { user: 'gm', role: 'gm', rows: [row('p1', 'v', 'Vex', GAME)] });
	await page.goto('/campaigns');
	await page.getByRole('link', { name: 'OPEN LIVE DASHBOARD →' }).click();
	await expect(page).toHaveURL(/\/campaigns\/party$/);
	await expect(page.locator('article.card')).toContainText('Vex');
});
