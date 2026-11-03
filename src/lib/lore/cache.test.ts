import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoreEntry } from './types.ts';

// In-memory localStorage plus a fake Supabase that answers what we tell it.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, v)
});
vi.stubGlobal('navigator', { onLine: true });

let listResult: { data: LoreEntry[] | null; error: unknown };
let writeResult: { data: LoreEntry | null; error: unknown };

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
			from: () => ({
				select: () => chain(() => listResult),
				insert: () => chain(() => writeResult),
				update: () => chain(() => writeResult),
				delete: () => chain(() => ({ error: null }))
			})
		})
	};
});

const { deleteEntry, listEntries, reconcileCache, saveEntry } = await import('./api.ts');
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
