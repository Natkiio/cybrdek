import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoreEntry } from './types.ts';

// In-memory localStorage plus a fake Supabase that answers what we tell it.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	get length() {
		return store.size;
	},
	key: (i: number) => [...store.keys()][i] ?? null,
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, v),
	removeItem: (k: string) => void store.delete(k)
});
vi.stubGlobal('navigator', { onLine: true });

let listResult: { data: LoreEntry[] | null; error: unknown };
let writeResult: { data: LoreEntry | null; error: unknown };
let sessionUser: string | null = null;

vi.mock('#lib/supabase/client.ts', () => {
	const chain = (result: () => unknown) => {
		const c: Record<string, unknown> = {};
		for (const m of ['select', 'order', 'eq', 'insert', 'update', 'delete', 'abortSignal']) c[m] = () => c;
		c.single = () => Promise.resolve(result());
		c.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
			Promise.resolve(result()).then(ok, bad);
		return c;
	};
	return {
		supabase: () => ({
			auth: {
				getSession: () =>
					Promise.resolve({ data: { session: sessionUser ? { user: { id: sessionUser } } : null } })
			},
			from: () => ({
				select: () => chain(() => listResult),
				insert: () => chain(() => writeResult),
				update: () => chain(() => writeResult),
				delete: () => chain(() => ({ error: null }))
			})
		})
	};
});

const { clearPrivateCaches, deleteEntry, listEntries, reconcileCache, saveEntry } = await import('./api.ts');
const { campaign, VOYAGE_CITY_ID } = await import('#lib/campaigns/current.svelte.ts');
const { latestOnly } = await import('./latest.ts');

const entry = (id: string, title: string, visible = true): LoreEntry => ({
	id,
	slug: id,
	title,
	type: 'location',
	summary: '',
	body: `${title} secrets`,
	visible,
	created_at: '',
	updated_at: ''
});

async function goOffline() {
	(navigator as { onLine: boolean }).onLine = false;
	return listEntries();
}

describe('on-device lore cache (Codex, #42 review)', () => {
	beforeEach(async () => {
		store.clear();
		(navigator as { onLine: boolean }).onLine = true;
		listResult = { data: [entry('araki', 'Araki'), entry('gecko', 'Gecko')], error: null };
		await listEntries(); // device now holds both visible entries
	});

	it('drops an entry from the cache as soon as the GM hides it', async () => {
		writeResult = { data: entry('gecko', 'Gecko', false), error: null };
		await saveEntry({ title: 'Gecko', type: 'location', summary: '', body: '', visible: false }, 'gecko');
		expect((await goOffline()).entries.map((e) => e.id)).toEqual(['araki']);
	});

	it('drops an entry from the cache when the GM deletes it', async () => {
		await deleteEntry('araki');
		expect((await goOffline()).entries.map((e) => e.id)).toEqual(['gecko']);
	});

	it('updates a visible entry in the cache after an edit', async () => {
		writeResult = { data: { ...entry('araki', 'Araki'), body: 'new text' }, error: null };
		await saveEntry({ title: 'Araki', type: 'location', summary: '', body: 'new text', visible: true }, 'araki');
		expect((await goOffline()).entries.find((e) => e.id === 'araki')?.body).toBe('new text');
	});

	it('leaves the cache alone when the save fails', async () => {
		writeResult = { data: null, error: { code: '42501', message: 'denied' } };
		await saveEntry({ title: 'Gecko', type: 'location', summary: '', body: '', visible: false }, 'gecko');
		expect((await goOffline()).entries).toHaveLength(2);
	});

	it('reconcileCache keeps title order and ignores hidden rows', () => {
		const cache = [entry('b', 'Bowetown')];
		expect(reconcileCache(cache, 'a', entry('a', 'Akiba')).map((e) => e.id)).toEqual(['a', 'b']);
		expect(reconcileCache(cache, 'a', entry('a', 'Akiba', false)).map((e) => e.id)).toEqual(['b']);
	});
});

describe('latestOnly', () => {
	it('lets only the newest overlapping request apply', () => {
		const latest = latestOnly();
		const gmRead = latest.begin();
		const playerRead = latest.begin();
		expect(playerRead()).toBe(true);
		expect(gmRead()).toBe(false); // finishing late, it must be thrown away
	});
});

describe('private campaign offline copies (Codex review of #63)', () => {
	const offline = () => vi.stubGlobal('navigator', { onLine: false });
	const secret = entry('s', 'Members only');

	beforeEach(async () => {
		store.clear();
		vi.stubGlobal('navigator', { onLine: true });
		campaign.id = 'private-campaign';
		sessionUser = 'player-a';
		listResult = { data: [secret], error: null };
		await listEntries(); // player A reads it online, which saves a copy
	});

	afterEach(() => {
		campaign.id = VOYAGE_CITY_ID;
		sessionUser = null;
		vi.stubGlobal('navigator', { onLine: true });
	});

	it('gives the account that saved it its copy offline', async () => {
		offline();
		expect((await listEntries()).entries).toEqual([secret]);
	});

	it('gives nothing to someone signed out', async () => {
		sessionUser = null;
		offline();
		expect((await listEntries()).entries).toEqual([]);
	});

	it('gives nothing to a different account on the device', async () => {
		sessionUser = 'player-b';
		offline();
		expect((await listEntries()).entries).toEqual([]);
	});

	it('gives nothing when the network fails, not only when known offline', async () => {
		sessionUser = null;
		listResult = { data: null, error: { message: 'down' } };
		expect((await listEntries()).entries).toEqual([]);
	});

	it('saves no copy for someone signed out', async () => {
		store.clear();
		sessionUser = null;
		await listEntries();
		expect(store.size).toBe(0);
	});

	it('keeps one campaign out of another', async () => {
		campaign.id = 'other-campaign';
		offline();
		expect((await listEntries()).entries).toEqual([]);
	});

	describe('when the account changes during a request (Codex review of #67)', () => {
		const later = entry('l', 'Written by A');
		const tick = () => new Promise((resolve) => setTimeout(resolve));
		const privateKeys = () => [...store.keys()].filter((k) => k.startsWith('cybrdek.lore.v1:'));

		it("keeps a slow save out of the next account's copy", async () => {
			let finish = (_: unknown) => {};
			writeResult = new Promise((resolve) => (finish = resolve)) as never;
			const saving = saveEntry({ title: 'Written by A', type: 'other', summary: '', body: '', visible: true });
			await tick();
			sessionUser = 'player-b';
			finish({ data: later, error: null });
			await saving;
			offline();
			expect((await listEntries()).entries).toEqual([]);
		});

		it('a slow delete leaves the next account alone', async () => {
			sessionUser = 'player-b';
			listResult = { data: [later], error: null };
			await listEntries();
			sessionUser = 'player-a';
			const deleting = deleteEntry('l');
			sessionUser = 'player-b';
			await deleting;
			offline();
			expect((await listEntries()).entries).toEqual([later]);
		});

		it('a slow read cannot bring back a copy that sign-out removed', async () => {
			let finish = (_: unknown) => {};
			listResult = new Promise((resolve) => (finish = resolve)) as never;
			const reading = listEntries();
			await tick();
			sessionUser = null;
			clearPrivateCaches();
			finish({ data: [secret], error: null });
			await reading;
			expect(privateKeys()).toEqual([]);
		});
	});

	it('clearing removes private copies and leaves public Voyage City', async () => {
		store.set('cybrdek.lore.v1', '[]');
		clearPrivateCaches();
		expect([...store.keys()]).toEqual(['cybrdek.lore.v1']);
	});

	it('Voyage City stays readable signed out', async () => {
		campaign.id = VOYAGE_CITY_ID;
		sessionUser = null;
		listResult = { data: [secret], error: null };
		await listEntries();
		offline();
		expect((await listEntries()).entries).toEqual([secret]);
	});
});
