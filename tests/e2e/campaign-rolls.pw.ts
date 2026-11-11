import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';

const CAMPAIGN = '00000000-0000-4000-8000-000000000001';
const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';

async function setup(page: Page, isGm = false) {
	const rows: Record<string, unknown>[] = [];
	const posts: Record<string, unknown>[] = [];
	const filters: string[] = [];
	let offline = false;
	let displayName = 'Player';
	let socket: WebSocketRoute | undefined;
	let topic = '';
	let joinRef: string | null = null;
	await page.addInitScript(({ user }) => {
		const now = Math.floor(Date.now() / 1000);
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			localStorage.setItem('sb-hntlvhspyllaaidvxlox-auth-token', JSON.stringify({
				access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer',
				expires_in: 3600, expires_at: now + 3600,
				user: { id: user, aud: 'authenticated', email: 'player@example.com', app_metadata: {}, user_metadata: {}, created_at: '' }
			}));
		}
	}, { user: USER });
	await page.route(/supabase\.co/, async route => {
		const req = route.request();
		const url = new URL(req.url());
		const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
		if (url.pathname.endsWith('/rpc/is_campaign_gm')) return json(isGm);
		if (url.pathname.endsWith('/rpc/is_campaign_member')) return json(true);
		if (url.pathname.endsWith('/rpc/set_campaign_display_name')) {
			displayName = JSON.parse(req.postData()!).member_name;
			return json(null);
		}
		if (url.pathname.endsWith('/campaign_members')) {
			return json([{ campaign_id: CAMPAIGN, role: isGm ? 'gm' : 'player', display_name: displayName }]);
		}
		if (url.pathname.endsWith('/campaigns')) return json([{ id: CAMPAIGN, name: 'Voyage City', is_public: true }]);
		if (url.pathname.endsWith('/campaign_rolls')) {
			if (req.method() === 'GET') {
				filters.push(url.searchParams.get('campaign_id') ?? '');
				return json(rows);
			}
			if (offline) return route.abort();
			const row = JSON.parse(req.postData()!);
			posts.push(row);
			if (!rows.some(r => r.id === row.id)) rows.unshift({ ...row, roller_name: displayName, sequence: rows.length + 1 });
			return route.fulfill({ status: 201, body: '' });
		}
		return json([]);
	});
	await page.routeWebSocket(/supabase\.co/, ws => {
		socket = ws;
		ws.onMessage(message => {
			const [refJoin, ref, receivedTopic, event, payload] = JSON.parse(String(message));
			if (event === 'phx_join') {
				topic = receivedTopic; joinRef = refJoin;
				ws.send(JSON.stringify([refJoin, ref, topic, 'phx_reply', {
					status: 'ok', response: { postgres_changes: payload.config.postgres_changes.map((filter: object) => ({ ...filter, id: 1 })) }
				}]));
			} else if (event === 'heartbeat') {
				ws.send(JSON.stringify([null, ref, receivedTopic, 'phx_reply', { status: 'ok', response: {} }]));
			}
		});
	});
	await page.goto('/dice');
	await expect(page.getByRole('button', { name: 'CAMPAIGN', exact: true })).toBeVisible();
	return {
		posts, filters, rows,
		offline: (value: boolean) => { offline = value; },
		async remoteRoll() {
			const row = { id: '20000000-0000-4000-8000-000000000002', user_id: OTHER, campaign_id: CAMPAIGN,
				rolled_at: new Date().toISOString(), label: 'Remote Handgun', roller_name: 'friend', kind: 'skill',
				result: { rolls: [7], modifier: 8, total: 15 }, hidden: false, sequence: 99 };
			rows.unshift(row);
			await expect.poll(() => topic).not.toBe('');
			socket!.send(JSON.stringify([joinRef, null, topic, 'postgres_changes', { ids: [1], data: {
				schema: 'public', table: 'campaign_rolls', type: 'INSERT', commit_timestamp: new Date().toISOString(),
				columns: [], record: row, old_record: {}, errors: null
			} }]));
		}
	};
}

test('member rolls post to the campaign, and a Realtime insert appears without navigating', async ({ page }) => {
	const fake = await setup(page);
	await page.getByRole('button', { name: 'd6', exact: true }).click();
	await expect.poll(() => fake.posts.length).toBe(1);
	expect(fake.posts[0]).toMatchObject({ campaign_id: CAMPAIGN, user_id: USER, hidden: false, label: '1d6' });
	await expect(page.locator('.rolls')).toContainText('YOU');
	await fake.remoteRoll();
	await expect(page.locator('.rolls')).toContainText('Remote Handgun');
	await expect(page.locator('.rolls')).toContainText('friend');
	expect(fake.filters.every(f => f === `eq.${CAMPAIGN}`)).toBe(true);
	await expect(page.getByLabel('HIDE MY NEXT ROLLS (GM ONLY)')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'CLEAR', exact: true })).toHaveCount(0);
	await page.screenshot({ path: test.info().outputPath('campaign-rolls-mobile.png'), fullPage: true });
});

test('offline roll stays on device and retries after reload without changing its identity', async ({ page }) => {
	const fake = await setup(page);
	fake.offline(true);
	await page.getByRole('button', { name: 'd10', exact: true }).click();
	await expect(page.locator('.rolls')).toContainText('PENDING');
	const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('cybrdek:pending-rolls')!));
	await page.getByRole('button', { name: 'DEVICE', exact: true }).click();
	await expect(page.locator('.rolls')).toContainText('1d10');
	await expect(page.getByRole('button', { name: 'CLEAR', exact: true })).toBeVisible();
	fake.offline(false);
	await page.reload();
	await expect.poll(() => fake.posts.length).toBe(1);
	expect(fake.posts[0]).toMatchObject({ id: queue[0].id, campaign_id: CAMPAIGN, user_id: USER });
	await expect(page.locator('.rolls')).not.toContainText('PENDING');
});

test('GM can choose hidden rolls; hidden choice resets on reload', async ({ page }) => {
	const fake = await setup(page, true);
	await page.getByLabel('HIDE MY NEXT ROLLS (GM ONLY)').check();
	await page.getByRole('button', { name: 'd6', exact: true }).click();
	await expect.poll(() => fake.posts.length).toBe(1);
	expect(fake.posts[0].hidden).toBe(true);
	await expect(page.locator('.rolls')).toContainText('GM ONLY');
	await page.reload();
	await expect(page.getByLabel('HIDE MY NEXT ROLLS (GM ONLY)')).not.toBeChecked();
});

test('anonymous rolling works after an offline reload and never queues a campaign post', async ({ page, context }) => {
	await context.route(/supabase\.co/, route => route.abort());
	await page.goto('/dice');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) await new Promise<void>(resolve =>
			navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
	});
	await context.setOffline(true);
	await page.reload();
	await page.getByRole('button', { name: 'd6', exact: true }).click();
	await expect(page.locator('.rolls')).toContainText('1d6');
	await expect(page.getByRole('button', { name: 'CAMPAIGN', exact: true })).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('cybrdek:pending-rolls'))).toBeNull();
	await context.setOffline(false);
});


test('a member chooses their campaign display name before rolling', async ({ page }) => {
	const fake = await setup(page);
	await page.goto('/campaigns');
	await expect(page.getByLabel('Campaign display name')).toHaveValue('Player');
	await page.getByLabel('Campaign display name').fill('Vex');
	await page.getByRole('button', { name: 'SAVE NAME', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Name saved.');
	await page.goto('/dice');
	await page.getByRole('button', { name: 'd6', exact: true }).click();
	await expect.poll(() => fake.posts.length).toBe(1);
	expect(fake.rows[0].roller_name).toBe('Vex');
	expect(fake.posts[0]).not.toHaveProperty('roller_name');
});
