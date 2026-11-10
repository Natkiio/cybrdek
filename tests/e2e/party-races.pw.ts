// Races in the campaign picker (review of #91), adapted from the reviewer's
// reproductions to assert the fixed behaviour.
import { test, expect, type Page } from '@playwright/test';
const GAME = '00000000-0000-4000-8000-000000000001';
const AUTH_KEY = 'sb-hntlvhspyllaaidvxlox-auth-token';
const sheet = (id: string, name: string) => ({ id, name, rulesetId: 'cyberpunk-red',
	stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 },
	skills: {}, extra: { role: 'solo', roleRank: 4 } });
const session = (id: string) => ({ access_token: `token-${id}`, refresh_token: 'refresh', token_type: 'bearer',
	expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
	user: { id, aud: 'authenticated', email: `${id}@example.com`, app_metadata: {}, user_metadata: {}, created_at: '' } });
const row = (user: string, name: string) => ({ user_id: user, id: `char-${user}`, data: sheet(`char-${user}`, name),
	updated_at: 1000, deleted_at: null, campaign_id: null });

async function setup(page: Page) {
	const state = {
		rows: [] as ReturnType<typeof row>[], holdPickerA: false, holdSave: false,
		releasePicker: undefined as undefined | (() => void), releaseSave: undefined as undefined | (() => void),
		pickerUsers: [] as string[], saves: 0, readsAfterSave: 0
	};
	await page.context().route(/supabase\.co/, async route => {
		const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
		const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
		if (path.endsWith('/rpc/is_campaign_gm')) return json(false);
		if (path.endsWith('/campaigns')) return json([{ id: GAME, name: 'Voyage City', is_public: true }]);
		if (path.endsWith('/campaign_members')) return json([{ campaign_id: GAME, role: 'player' }]);
		if (path.endsWith('/characters')) {
			const who = url.searchParams.get('user_id')?.replace('eq.', '') ?? '';
			const snapshot = state.rows.filter(r => r.user_id === who);
			if (url.searchParams.get('select') === 'id,data,campaign_id') {
				state.pickerUsers.push(who);
				if (who === 'a' && state.holdPickerA) {
					state.holdPickerA = false;
					await new Promise<void>(resolve => { state.releasePicker = resolve; });
				}
			}
			return json(snapshot);
		}
		if (path.endsWith('/rpc/my_characters')) {
			if (state.saves) state.readsAfterSave++;
			const owner = JSON.parse(req.postData() ?? '{}').owner;
			return json(state.rows.filter((r) => r.user_id === owner));
		}
		if (path.endsWith('/rpc/save_character')) {
			const body = JSON.parse(req.postData()!);
			if (state.holdSave) {
				state.holdSave = false;
				await new Promise<void>(resolve => { state.releaseSave = resolve; });
			}
			state.rows.push({ user_id: 'a', id: body.character_id, data: body.character_data,
				updated_at: body.saved_at, deleted_at: body.removed_at, campaign_id: null });
			state.saves++;
			return json(body.saved_at);
		}
		return json(path.includes('/auth/') ? {} : []);
	});
	await page.addInitScript(([key, value]) => {
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, JSON.stringify(value));
		}
	}, [AUTH_KEY, session('a')] as const);
	return state;
}


test("a slow reply for the last account never shows on the next account's picker", async ({ page }) => {
	const state = await setup(page);
	state.rows = [row('a', 'A private character name'), row('b', 'B character')];
	state.holdPickerA = true;
	await page.goto('/campaigns');
	await expect.poll(() => !!state.releasePicker).toBe(true);
	await page.evaluate(
		([key, value]) => {
			localStorage.setItem(key, JSON.stringify(value));
			const channel = new BroadcastChannel(key);
			channel.postMessage({ event: 'SIGNED_IN', session: value });
			channel.close();
		},
		[AUTH_KEY, session('b')] as const
	);
	const panel = page.locator('section.panel').filter({ hasText: 'YOUR CHARACTER' });
	await expect(panel.getByText('B character', { exact: true })).toBeVisible();
	state.releasePicker!();
	await expect.poll(() => state.pickerUsers.filter((u) => u === 'a').length).toBe(1);
	await page.waitForTimeout(300); // give A's late reply every chance to land
	await expect(panel.getByText('B character', { exact: true })).toBeVisible();
	await expect(page.getByText('A private character name')).toHaveCount(0);
});

test('the picker waits for an upload already running, then lists the new character', async ({ page }) => {
	const state = await setup(page);
	await page.goto('/characters');
	await expect(page.getByRole('status').filter({ hasText: 'SYNCED TO YOUR ACCOUNT' })).toBeVisible();
	state.holdSave = true;
	await page.evaluate(async (character) => {
		await new Promise<void>((resolve, reject) => {
			const open = indexedDB.open('cybrdek');
			open.onerror = () => reject(open.error);
			open.onsuccess = () => {
				const db = open.result;
				const tx = db.transaction('characters', 'readwrite');
				tx.objectStore('characters').put({ ...character, ownerId: 'a', dirty: true, updatedAt: Date.now() });
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
			};
		});
		window.dispatchEvent(new Event('online'));
	}, sheet('new', 'Just created'));
	await expect.poll(() => !!state.releaseSave).toBe(true);
	await page.getByRole('link', { name: 'CAMPAIGN: Voyage City', exact: true }).click();
	const panel = page.locator('section.panel').filter({ hasText: 'YOUR CHARACTER' });
	await expect(panel.getByText('LOADING…')).toBeVisible();
	await expect(panel.getByText('You have no characters in your account yet.', { exact: false })).toHaveCount(0);
	state.releaseSave!();
	await expect(panel.getByText('Just created')).toBeVisible();
});
