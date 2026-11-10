import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
	member: true, rows: [] as Record<string, unknown>[], fail: false,
	posts: [] as Record<string, unknown>[],
	change: () => {}, status: (_status: string) => {},
	membership: undefined as undefined | Promise<{ data: boolean; error: null }>,
	reject: {} as Record<string, { code: string; status: number }>,
	removed: vi.fn()
}));
vi.mock('#lib/supabase/client.ts', () => ({ supabase: () => ({
	rpc: () => fake.membership ?? Promise.resolve({ data: fake.member, error: null }),
	from: () => ({
		select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: fake.rows, error: null }) }) }) }),
		upsert: async (row: Record<string, unknown>) => {
			fake.posts.push(row);
			const rejection = fake.reject[row.id as string];
			return { error: rejection ? { code: rejection.code, message: 'rejected' } : fake.fail ? { message: 'offline' } : null, status: rejection?.status ?? (fake.fail ? 0 : 201) };
		}
	}),
	channel: () => ({ on: (_event: unknown, _filter: unknown, callback: () => void) => {
		fake.change = callback;
		return { subscribe: (callback: (status: string) => void) => { fake.status = callback; return {}; } };
	} }),
	removeChannel: fake.removed
}) }));

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const roll = (id = 'roll-1') => ({ id, at: Date.now(), label: 'Handgun', kind: 'skill' as const, result: { rolls: [7], modifier: 8, total: 15 } });
const row = (label = 'Other player') => ({ id: 'remote-1', rolled_at: new Date().toISOString(), character_id: null,
	label, kind: 'skill', result: roll().result, user_id: 'other', hidden: false });
let stop: (() => void) | undefined;

beforeEach(() => {
	vi.resetModules();
	fake.reject = {};
	fake.member = true; fake.rows = []; fake.posts = []; fake.fail = false; fake.membership = undefined;
	const storage = new Map<string, string>();
	vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
	vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval: () => 1, clearInterval: vi.fn() });
});
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); });

describe('campaign roll lifecycle', () => {
	it('loads a snapshot, refreshes on Realtime inserts and on subscription recovery', async () => {
		const m = await import('./campaign.svelte.ts');
		fake.rows = [row()];
		stop = m.startCampaignRolls('campaign-a', 'player-a');
		await settle();
		expect(m.sharedRolls.entries[0].label).toBe('Other player');
		fake.rows = [row('Live roll')]; fake.change(); await settle();
		expect(m.sharedRolls.entries[0].label).toBe('Live roll');
		fake.rows = [row('Missed while offline')]; fake.status('SUBSCRIBED'); await settle();
		expect(m.sharedRolls.entries[0].label).toBe('Missed while offline');
	});
	it('keeps the original id, account, campaign and hidden choice through an offline retry', async () => {
		const m = await import('./campaign.svelte.ts');
		stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
		fake.fail = true; m.sharedRolls.hidden = true; m.shareRoll(roll()); await settle();
		expect(m.sharedRolls.pending).toBe(1);
		expect(JSON.parse(localStorage.getItem('cybrdek:pending-rolls')!)[0]).toMatchObject({ id: 'roll-1', campaignId: 'campaign-a', userId: 'player-a', hidden: true });
		fake.fail = false; m.sharedRolls.hidden = false; fake.status('SUBSCRIBED'); await settle();
		expect(fake.posts).toHaveLength(2);
		expect(fake.posts[1]).toEqual(fake.posts[0]);
		expect(m.sharedRolls.pending).toBe(0);
	});
	it('does not post another account or campaign queue; restores it only in its original scope', async () => {
		const m = await import('./campaign.svelte.ts');
		stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
		fake.fail = true; m.shareRoll(roll()); await settle(); stop?.();
		fake.fail = false; fake.posts = [];
		stop = m.startCampaignRolls('campaign-a', 'player-b'); await settle();
		expect(fake.posts).toHaveLength(0); stop?.();
		stop = m.startCampaignRolls('campaign-b', 'player-a'); await settle();
		expect(fake.posts).toHaveLength(0); stop?.();
		stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
		expect(fake.posts).toHaveLength(1);
	});
	it('ignores callbacks and in-flight reads from the previous account after sign-out', async () => {
		const m = await import('./campaign.svelte.ts');
		let resolve!: (value: { data: boolean; error: null }) => void;
		fake.membership = new Promise(r => { resolve = r; }); fake.rows = [row('Private')];
		stop = m.startCampaignRolls('campaign-a', 'player-a');
		const oldChange = fake.change;
		stop?.(); stop = undefined; m.startCampaignRolls('campaign-a', null);
		resolve({ data: true, error: null }); oldChange(); await settle();
		expect(m.sharedRolls.entries).toEqual([]);
		expect(m.sharedRolls.member).toBe(false);
	});
	it('keeps offline rolls on the device even when the campaign post fails', async () => {
		const m = await import('./campaign.svelte.ts');
		const local = await import('./log.svelte.ts');
		stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
		fake.fail = true;
		const entry = local.logRoll({ label: 'Offline shot', kind: 'skill', result: roll().result });
		await settle();
		expect(local.getRolls()[0]).toMatchObject({ id: entry.id, label: 'Offline shot' });
		expect(JSON.parse(localStorage.getItem('cybrdek:rolls')!)[0].id).toBe(entry.id);
		expect(m.sharedRolls.pendingEntries[0].id).toBe(entry.id);
	});
	it('ignores malformed saved queue entries instead of breaking the roller', async () => {
		localStorage.setItem('cybrdek:pending-rolls', JSON.stringify([null, {}, { at: 'bad' }]));
		const m = await import('./campaign.svelte.ts');
		stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
		m.shareRoll(roll()); await settle();
		expect(fake.posts).toHaveLength(1);
	});
	it('caps offline pending rolls at the newest 100', async () => {
		const m = await import('./campaign.svelte.ts');
		stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
		fake.fail = true;
		for (let i = 0; i < 105; i++) m.shareRoll(roll(`roll-${i}`));
		await settle();
		expect(m.sharedRolls.pendingEntries).toHaveLength(100);
		expect(m.sharedRolls.pendingEntries[0].id).toBe('roll-104');
		expect(m.sharedRolls.pendingEntries.at(-1)?.id).toBe('roll-5');
	});
	it.each([['42501', 403], ['23514', 400], ['PGRST102', 400]] as const)(
		'drops permanent %s rejection and sends the valid roll behind it', async (code, status) => {
			const m = await import('./campaign.svelte.ts');
			const local = await import('./log.svelte.ts');
			stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
			fake.fail = true;
			const bad = local.logRoll({ label: 'Rejected offline roll', kind: 'skill', result: roll().result });
			const good = local.logRoll({ label: 'Valid offline roll', kind: 'skill', result: roll().result });
			await settle();
			fake.fail = false; fake.posts = []; fake.reject[bad.id] = { code, status };
			fake.status('SUBSCRIBED'); await settle();
			expect(fake.posts.map(r => r.id)).toEqual([bad.id, good.id]);
			expect(m.sharedRolls.pending).toBe(0);
			expect(m.sharedRolls.rejected).toBe(1);
			expect(local.getRolls().map(r => r.id)).toContain(bad.id);
			expect(JSON.parse(localStorage.getItem('cybrdek:pending-rolls')!)).toEqual([]);
			fake.posts = []; fake.status('SUBSCRIBED'); await settle();
			expect(fake.posts).toEqual([]);
		}
	);
	it.each([['server', 503], ['timeout', 408], ['rate_limit', 429], ['expired_jwt', 401], ['PGRST301', 401], ['PGRST303', 403]] as const)(
		'keeps retryable %s failures queued', async (code, status) => {
			const m = await import('./campaign.svelte.ts');
			stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
			fake.reject['retry-me'] = { code, status };
			m.shareRoll(roll('retry-me')); await settle();
			expect(m.sharedRolls.pending).toBe(1);
			expect(m.sharedRolls.rejected).toBe(0);
			expect(JSON.parse(localStorage.getItem('cybrdek:pending-rolls')!)[0].id).toBe('retry-me');
			fake.reject = {}; fake.status('SUBSCRIBED'); await settle();
			expect(m.sharedRolls.pending).toBe(0);
			expect(fake.posts).toHaveLength(2);
			expect(fake.posts[1]).toEqual(fake.posts[0]);
		}
	);
	it('clears private history when membership is removed' , async () => {
		const m = await import('./campaign.svelte.ts'); fake.rows = [row()];
		stop = m.startCampaignRolls('campaign-a', 'player-a'); await settle();
		fake.member = false; fake.change(); await settle();
		expect(m.sharedRolls.entries).toEqual([]);
		expect(m.sharedRolls.member).toBe(false);
	});
});
