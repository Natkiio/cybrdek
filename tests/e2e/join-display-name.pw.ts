import { test, expect, type Page } from '@playwright/test';

const KEY = 'sb-hntlvhspyllaaidvxlox-auth-token';
const GAME = 'c0000000-0000-4000-8000-000000000002';
const SECOND = 'c0000000-0000-4000-8000-000000000003';
const games = [
	{ id: GAME, name: 'Friend Game', is_public: false },
	{ id: SECOND, name: 'Second Game', is_public: false }
];
const session = (id: string) => ({ access_token: `token-${id}`, refresh_token: 'refresh', token_type: 'bearer',
	expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
	user: { id, aud: 'authenticated', email: `${id}@example.com`, app_metadata: {}, user_metadata: {}, created_at: '' } });

async function setup(page: Page) {
	const fake = {
		joined: [] as string[], names: [] as { campaign: string; member_name: string }[],
		name: 'Existing name', failName: false, badInvite: false, holdJoin: false, holdSave: false,
		releaseJoin: undefined as (() => void) | undefined,
		releaseSave: undefined as (() => void) | undefined
	};
	await page.context().route(/supabase\.co/, async route => {
		const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
		const body = JSON.parse(req.postData() ?? '{}');
		const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
		if (path.endsWith('/rpc/is_campaign_gm')) return json(false);
		if (path.endsWith('/rpc/is_campaign_member')) return json(false);
		if (path.endsWith('/rpc/join_campaign')) {
			fake.joined.push(body.invite_code);
			if (fake.badInvite) return json({ code: 'P0002', message: 'Invalid invite' }, 400);
			const id = req.headers().authorization?.includes('token-b') ? SECOND : GAME;
			if (fake.holdJoin && id === GAME) await new Promise<void>(resolve => { fake.releaseJoin = resolve; });
			return json(id);
		}
		if (path.endsWith('/rpc/set_campaign_display_name')) {
			fake.names.push(body);
			if (fake.holdSave) await new Promise<void>(resolve => { fake.releaseSave = resolve; });
			if (fake.failName) return json({ code: '42501', message: 'Could not save' }, 403);
			fake.name = body.member_name;
			return json(null);
		}
		if (path.endsWith('/campaigns')) {
			const id = url.searchParams.get('id')?.replace('eq.', '');
			return json(req.headers().accept?.includes('vnd.pgrst.object') ? games.find(g => g.id === id) : games);
		}
		if (path.endsWith('/campaign_members')) return json(games.map(g => ({ campaign_id: g.id, role: 'player', display_name: fake.name })));
		return json([]);
	});
	await page.addInitScript(([key, value]) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, JSON.stringify(value));
	}, [KEY, session('a')] as const);
	return fake;
}

async function changeAccount(page: Page) {
	await page.evaluate(([key, value]) => {
		localStorage.setItem(key, JSON.stringify(value));
		const channel = new BroadcastChannel(key);
		channel.postMessage({ event: 'SIGNED_IN', session: value }); channel.close();
	}, [KEY, session('b')] as const);
}

const name = (page: Page) => page.getByLabel('Campaign display name');

test('join first, ask with an empty name, then save to that campaign and continue', async ({ page }) => {
	const fake = await setup(page);
	await page.goto('/join/invite-code');
	await expect(page.getByText('You joined Friend Game.')).toBeVisible();
	await expect(name(page)).toHaveValue('');
	await expect(page).toHaveURL(/\/join\/invite-code$/);
	expect(fake.joined).toEqual(['invite-code']);
	expect(fake.names).toEqual([]);
	await expect(page.getByRole('button', { name: 'SAVE AND CONTINUE' })).toBeDisabled();
	await name(page).fill('   ');
	await expect(page.getByRole('button', { name: 'SAVE AND CONTINUE' })).toBeDisabled();
	await name(page).fill('  Vex  ');
	await page.getByRole('button', { name: 'SAVE AND CONTINUE' }).click();
	await expect(page).toHaveURL(/\/campaigns$/);
	expect(fake.names).toEqual([{ campaign: GAME, member_name: 'Vex' }]);
	await expect(page.getByRole('link', { name: 'CAMPAIGN: Friend Game' })).toBeVisible();
});

test('skip leaves the existing name alone and continues to the campaign', async ({ page }) => {
	const fake = await setup(page);
	await page.goto('/join/invite-code');
	await expect(name(page)).toHaveValue('');
	await name(page).fill('Unsubmitted draft');
	await page.getByRole('button', { name: 'SKIP FOR NOW' }).click();
	await expect(page).toHaveURL(/\/campaigns$/);
	expect(fake.names).toEqual([]);
	expect(fake.name).toBe('Existing name');
});

test('a failed name save keeps the joined prompt and allows retry or skip', async ({ page }) => {
	const fake = await setup(page); fake.failName = true;
	await page.goto('/join/invite-code');
	await name(page).fill('Vex');
	await page.getByRole('button', { name: 'SAVE AND CONTINUE' }).click();
	await expect(page.getByRole('alert')).toContainText('Could not save your name');
	await expect(name(page)).toHaveValue('Vex');
	await expect(page).toHaveURL(/\/join\/invite-code$/);
	expect(fake.joined).toHaveLength(1);
	fake.failName = false;
	await page.getByRole('button', { name: 'SAVE AND CONTINUE' }).click();
	await expect(page).toHaveURL(/\/campaigns$/);
	expect(fake.names).toHaveLength(2);
});

test('an invalid invite never offers the name prompt or a save', async ({ page }) => {
	const fake = await setup(page); fake.badInvite = true;
	await page.goto('/join/bad-code');
	await expect(page.getByRole('alert')).toHaveText('That invite link is not valid.');
	await expect(name(page)).toHaveCount(0);
	expect(fake.names).toEqual([]);
});

test('an old account join reply cannot replace the new account prompt', async ({ page }) => {
	const fake = await setup(page); fake.holdJoin = true;
	await page.goto('/join/invite-code');
	await expect.poll(() => !!fake.releaseJoin).toBe(true);
	await changeAccount(page);
	await expect(page.getByText('You joined Second Game.')).toBeVisible();
	fake.releaseJoin!();
	await page.waitForTimeout(150); // allow the old RPC and campaign lookup to finish
	await expect(page.getByText('You joined Second Game.')).toBeVisible();
	await expect(name(page)).toHaveValue('');
	await expect(page.getByText('You joined Friend Game.')).toHaveCount(0);
});

test('a name-save reply after an account change cannot redirect the next account', async ({ page }) => {
	const fake = await setup(page); fake.holdSave = true;
	await page.goto('/join/invite-code');
	await name(page).fill('A name');
	await page.getByRole('button', { name: 'SAVE AND CONTINUE' }).click();
	await expect.poll(() => !!fake.releaseSave).toBe(true);
	await changeAccount(page);
	await expect(page.getByText('You joined Second Game.')).toBeVisible();
	fake.releaseSave!();
	await page.waitForTimeout(150);
	await expect(page).toHaveURL(/\/join\/invite-code$/);
	await expect(page.getByText('You joined Second Game.')).toBeVisible();
	await expect(name(page)).toHaveValue('');
});
