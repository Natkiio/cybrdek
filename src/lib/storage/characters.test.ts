import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '#lib/engine/types.ts';

let user: string | null = null;
vi.mock('#lib/supabase/client.ts', () => ({
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: user ? { user: { id: user } } : null } }) }
	})
}));

const store = await import('./characters.ts');
const { default: Dexie } = await import('dexie');

const raw = async () => {
	const db = await new Dexie('cybrdek').open();
	const rows = await db.table('characters').toArray();
	db.close();
	return rows as (Character & Record<string, unknown>)[];
};
const sheet = (id: string, name = id): Character => ({ id, name, rulesetId: 'cyberpunk-red', stats: {}, skills: {}, extra: {} });
const names = async () => (await store.listCharacters()).map((c) => c.name).sort();

beforeEach(async () => {
	user = null;
	const db = await new Dexie('cybrdek').open().catch(() => null);
	await db?.table('characters').clear();
	db?.close();
});

describe('whose characters show', () => {
	it('signed out: a new character stays on the device, and no sync fields reach the app', async () => {
		await store.saveCharacter(sheet('a'));
		expect((await raw())[0].ownerId).toBeUndefined();
		expect(await store.getCharacter('a')).toEqual(sheet('a'));
	});

	it('signed in: a new character belongs to the account and waits to sync', async () => {
		user = 'u1';
		await store.saveCharacter(sheet('a'));
		expect((await raw())[0]).toMatchObject({ ownerId: 'u1', dirty: true });
	});

	it("one account can't see another's, signed out or signed in", async () => {
		user = 'u1';
		await store.saveCharacter(sheet('mine'));
		user = 'u2';
		expect(await names()).toEqual([]);
		expect(await store.getCharacter('mine')).toBeUndefined();
		user = null;
		expect(await names()).toEqual([]);
		user = 'u1';
		expect(await names()).toEqual(['mine']);
	});

	it("can't rename or delete another account's", async () => {
		user = 'u1';
		await store.saveCharacter(sheet('mine'));
		user = 'u2';
		await store.renameCharacter('mine', 'Hacked');
		await store.deleteCharacter('mine');
		user = 'u1';
		expect(await names()).toEqual(['mine']);
	});
});

describe('moving in is the player\'s choice', () => {
	it('signing in leaves device-only characters alone, and edits keep them there', async () => {
		await store.saveCharacter(sheet('old'));
		user = 'u1';
		await store.saveCharacter(sheet('old', 'Renamed'));
		expect((await raw())[0].ownerId).toBeUndefined();
		expect(await store.listDeviceOnlyIds()).toEqual(new Set(['old']));
	});

	it('moveToAccount moves it', async () => {
		await store.saveCharacter(sheet('old'));
		user = 'u1';
		await store.moveToAccount('old');
		expect((await raw())[0]).toMatchObject({ ownerId: 'u1', dirty: true });
		expect(await store.isInAccount('old')).toBe(true);
	});

	it("needs an account, and can't take another account's", async () => {
		await store.saveCharacter(sheet('old'));
		await store.moveToAccount('old');
		expect((await raw())[0].ownerId).toBeUndefined();
		user = 'u1';
		await store.saveCharacter(sheet('mine'));
		user = 'u2';
		await store.moveToAccount('mine');
		expect((await raw()).find((r) => r.id === 'mine')?.ownerId).toBe('u1');
	});
});

describe('deleting', () => {
	it('device-only is removed at once', async () => {
		await store.saveCharacter(sheet('a'));
		await store.deleteCharacter('a');
		expect(await raw()).toEqual([]);
	});

	it('an account character becomes a hidden marker until the cloud knows', async () => {
		user = 'u1';
		await store.saveCharacter(sheet('a'));
		await store.deleteCharacter('a');
		expect(await names()).toEqual([]);
		const [row] = await raw();
		expect(row).toMatchObject({ dirty: true });
		expect(row.deletedAt).toBeTypeOf('number');
		await store.markPushed('a', row.updatedAt as number, 5);
		expect(await raw()).toEqual([]);
	});
});

describe('sync bookkeeping', () => {
	it('an edit made during a push stays waiting to sync', async () => {
		user = 'u1';
		await store.saveCharacter(sheet('a'));
		const sent = (await raw())[0].updatedAt as number;
		await store.markPushed('a', sent - 1, 42);
		expect((await raw())[0]).toMatchObject({ dirty: true, remoteAt: 42 });
		await store.markPushed('a', sent, 42);
		expect((await raw())[0]).toMatchObject({ dirty: false, remoteAt: 42 });
	});

	it("a pull won't overwrite an edit made after sync looked", async () => {
		user = 'u1';
		await store.saveCharacter(sheet('a', 'Fresh edit'));
		const remote = { id: 'a', data: {}, updated_at: 9, deleted_at: null };
		expect(await store.applyRemote('u1', remote, sheet('a', 'Cloud'), 1)).toBe(false);
		expect(await names()).toEqual(['Fresh edit']);
	});

	it('a pull keeps a device-only character with the same id, under a new id', async () => {
		await store.saveCharacter(sheet('a', 'Device copy'));
		user = 'u1';
		const remote = { id: 'a', data: {}, updated_at: 9, deleted_at: null };
		expect(await store.applyRemote('u1', remote, sheet('a', 'Cloud copy'))).toBe(true);
		expect(await names()).toEqual(['Cloud copy', 'Device copy']);
		expect((await store.getCharacter('a'))?.name).toBe('Cloud copy');
	});

	it("saving over another account's hidden copy keeps theirs", async () => {
		user = 'u1';
		await store.saveCharacter(sheet('a', 'Unsynced edit'));
		user = 'u2';
		await store.saveCharacter(sheet('a', 'From a backup file'));
		expect(await names()).toEqual(['From a backup file']);
		user = 'u1';
		expect(await names()).toEqual(['Unsynced edit']);
	});

	it('forgetting other accounts keeps their unsynced edits', async () => {
		user = 'u1';
		await store.saveCharacter(sheet('unsynced'));
		await store.saveCharacter(sheet('synced'));
		const row = (await raw()).find((r) => r.id === 'synced')!;
		await store.markPushed('synced', row.updatedAt as number, 1);
		await store.forgetOtherAccounts(undefined);
		expect((await raw()).map((r) => r.id)).toEqual(['unsynced']);
	});
});
