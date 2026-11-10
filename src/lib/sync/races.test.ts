// Races between sync, edits and account switches (review of #89). Uses the real
// storage and sync modules on fake IndexedDB. The fake cloud does NOT check
// owners, so these prove the device-side guards; tests/db/characters.test.ts
// proves the server refuses a save or list meant for another account.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Character } from '#lib/engine/types.ts';

const fake = vi.hoisted(() => ({
	user: 'a',
	read: undefined as undefined | Promise<{ data: unknown[]; error: null }>,
	posts: [] as { user: string; payload: Record<string, unknown> }[]
}));
vi.mock('#lib/supabase/client.ts', () => ({
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: fake.user } } } }) },
		rpc: (name: string, payload: Record<string, unknown>) => ({
			abortSignal: async () => {
				if (name === 'my_characters') return fake.read ?? { data: [], error: null };
				fake.posts.push({ user: fake.user, payload });
				return { data: payload.saved_at, error: null };
			}
		})
	})
}));

const sheet = (id: string, name: string): Character => ({ id, name, rulesetId: 'cyberpunk-red', stats: {}, skills: {}, extra: {} });
const rawRow = async (id: string) => {
	const db = await new Dexie('cybrdek').open();
	const row = await db.table('characters').get(id);
	db.close();
	return row as (Character & Record<string, unknown>) | undefined;
};

beforeEach(async () => {
	vi.resetModules();
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	vi.stubGlobal('window', { addEventListener: vi.fn() });
	vi.stubGlobal('document', { addEventListener: vi.fn() });
	vi.stubGlobal('navigator', { onLine: true });
	fake.user = 'a';
	fake.read = undefined;
	fake.posts = [];
	const db = await new Dexie('cybrdek').open().catch(() => undefined);
	await db?.table('characters').clear();
	db?.close();
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it("switching accounts mid-sync never sends A's character, and A's copy survives", async () => {
	const store = await import('#lib/storage/characters.ts');
	await store.saveCharacter(sheet('private-a', 'A private sheet'));
	let reply!: (value: { data: unknown[]; error: null }) => void;
	fake.read = new Promise((resolve) => (reply = resolve));
	const sync = await import('./characters.svelte.ts');
	sync.setSyncUser('a');
	const running = sync.syncCharacters();
	fake.user = 'b';
	sync.setSyncUser('b');
	fake.read = undefined; // B's own list, when the follow-up sync runs
	reply({ data: [], error: null });
	await running;
	expect(fake.posts.filter((p) => p.payload.character_id === 'private-a')).toEqual([]);
	await store.forgetOtherAccounts('b');
	expect(await rawRow('private-a')).toMatchObject({ ownerId: 'a', dirty: true, name: 'A private sheet' });
});

it("an old account's empty cloud list doesn't delete its clean copies after a switch", async () => {
	const store = await import('#lib/storage/characters.ts');
	await store.saveCharacter(sheet('kept', 'Synced earlier'));
	const [planned] = await store.syncRows('a');
	await store.markPushed('a', 'kept', planned.rev, 1000, () => true);
	let reply!: (value: { data: unknown[]; error: null }) => void;
	fake.read = new Promise((resolve) => (reply = resolve));
	const sync = await import('./characters.svelte.ts');
	sync.setSyncUser('a');
	const running = sync.syncCharacters();
	sync.setSyncUser('a2'); // switched before the reply landed
	fake.read = undefined;
	reply({ data: [], error: null }); // would read as "gone from the cloud" for A
	await running;
	expect(await rawRow('kept')).toBeDefined();
});

it('every save sent pairs its data with its own time; an edit mid-push goes up next pass', async () => {
	const store = await import('#lib/storage/characters.ts');
	vi.spyOn(Date, 'now').mockReturnValue(1000);
	await store.saveCharacter(sheet('x', 'Planned edit'));
	const original = store.rowToPush;
	let edited = false;
	vi.spyOn(store, 'rowToPush').mockImplementation(async (...args) => {
		if (!edited) {
			edited = true;
			vi.mocked(Date.now).mockReturnValue(3000);
			await store.saveCharacter(sheet('x', 'Newer edit at 3000'));
		}
		return original(...args);
	});
	const sync = await import('./characters.svelte.ts');
	sync.setSyncUser('a');
	await sync.syncCharacters();
	for (const post of fake.posts) {
		const name = (post.payload.character_data as Character).name;
		expect([name, post.payload.saved_at]).not.toEqual(['Newer edit at 3000', 1000]);
	}
	expect(fake.posts.at(-1)?.payload).toMatchObject({ saved_at: 3000, character_data: { name: 'Newer edit at 3000' } });
	expect((await store.syncRows('a'))[0]).toMatchObject({ dirty: false, updatedAt: 3000, remoteAt: 3000 });
});

it('cleanup and a save racing each other never lose the edit', async () => {
	const store = await import('#lib/storage/characters.ts');
	await store.saveCharacter(sheet('x', 'Clean cloud copy'));
	const [row] = await store.syncRows('a');
	await store.markPushed('a', 'x', row.rev, 1000, () => true);
	await Promise.all([store.forgetOtherAccounts(undefined), store.saveCharacter(sheet('x', 'Edit during cleanup'))]);
	expect((await rawRow('x'))?.name).toBe('Edit during cleanup');
});

it("a cleanup queued for an account that's already been replaced does nothing", async () => {
	const store = await import('#lib/storage/characters.ts');
	await store.saveCharacter(sheet('x', 'Clean cloud copy'));
	const [row] = await store.syncRows('a');
	await store.markPushed('a', 'x', row.rev, 1000, () => true);
	const sync = await import('./characters.svelte.ts');
	sync.setSyncUser('a');
	sync.setSyncUser(undefined); // signed out...
	sync.setSyncUser('a'); // ...and straight back in, before the timers ran
	await vi.runAllTimersAsync();
	expect(await rawRow('x')).toBeDefined();
});

it('an edit in the same millisecond as the one sent stays waiting to sync', async () => {
	const store = await import('#lib/storage/characters.ts');
	vi.spyOn(Date, 'now').mockReturnValue(1000);
	await store.saveCharacter(sheet('x', 'Sent edit'));
	const [planned] = await store.syncRows('a');
	expect(await store.rowToPush('a', 'x', planned.rev)).toBeDefined();
	await store.saveCharacter(sheet('x', 'Not sent, same millisecond'));
	await store.markPushed('a', 'x', planned.rev, 1000, () => true);
	expect((await store.syncRows('a'))[0].dirty).toBe(true);
	expect((await store.getCharacter('x'))?.name).toBe('Not sent, same millisecond');
});
