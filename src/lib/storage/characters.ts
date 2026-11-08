import Dexie, { type Table } from 'dexie';
import type { Character } from '#lib/engine/types.ts';
import { supabase } from '#lib/supabase/client.ts';
import type { LocalRow, RemoteRow } from '#lib/sync/plan.ts';

// With no ownerId a character is on this device only, as it always was. With
// one, it belongs to that account: only they see it here, and it syncs.
type StoredCharacter = Character & {
	updatedAt: number;
	ownerId?: string;
	dirty?: boolean;
	remoteAt?: number;
	deletedAt?: number;
};

class CybrdekDatabase extends Dexie {
	characters!: Table<StoredCharacter, string>;

	constructor() {
		super('cybrdek');
		this.version(1).stores({ characters: 'id, updatedAt' });
	}
}

let database: CybrdekDatabase | undefined;

function getDatabase(): CybrdekDatabase | undefined {
	if (typeof indexedDB === 'undefined') return undefined;

	database ??= new CybrdekDatabase();
	return database;
}

function cloneCharacter(character: Character): Character {
	return JSON.parse(JSON.stringify(character)) as Character;
}

function plainCharacter(row: StoredCharacter): Character {
	const { updatedAt: _u, ownerId: _o, dirty: _d, remoteAt: _r, deletedAt: _t, ...character } = row;
	return character;
}

async function currentUser(): Promise<string | undefined> {
	const { data } = await supabase().auth.getSession();
	return data.session?.user.id;
}

const visibleTo = (row: StoredCharacter, user: string | undefined) =>
	!row.deletedAt && (row.ownerId === undefined || row.ownerId === user);

// The sync module listens here. A callback, because it imports this file.
let onChange = () => {};
export function onCharacterChange(listener: () => void) {
	onChange = listener;
}

export async function saveCharacter(character: Character): Promise<void> {
	const db = getDatabase();
	// Saving must never silently fail, or the wizard would open a character that doesn't exist.
	if (!db) throw new Error('This browser has no on-device storage (IndexedDB).');

	const user = await currentUser();
	const existing = await db.characters.get(character.id);
	if (existing?.ownerId !== undefined && existing.ownerId !== user) await moveAside(db, existing);
	const kept = existing?.ownerId === user ? existing : undefined;
	// New characters join the account. An older device-only one waits for moveToAccount.
	const ownerId = kept?.ownerId ?? (existing && existing.ownerId === undefined ? undefined : user);
	await db.characters.put({
		...cloneCharacter(character),
		updatedAt: Date.now(),
		...(ownerId ? { ownerId, dirty: true, remoteAt: kept?.remoteAt } : {})
	});
	if (ownerId) onChange();
}

/** Another copy has this id (a shared backup file): keep it, under a new one. */
async function moveAside(db: CybrdekDatabase, row: StoredCharacter) {
	await db.transaction('rw', db.characters, async () => {
		await db.characters.delete(row.id);
		await db.characters.put({
			...row,
			id: crypto.randomUUID(),
			...(row.ownerId ? { dirty: true, remoteAt: undefined } : {})
		});
	});
}

export async function getCharacter(id: string): Promise<Character | undefined> {
	const db = getDatabase();
	if (!db) return undefined;

	const character = await db.characters.get(id);
	return character && visibleTo(character, await currentUser()) ? plainCharacter(character) : undefined;
}

export async function listCharacters(): Promise<Character[]> {
	const db = getDatabase();
	if (!db) return [];

	const user = await currentUser();
	const characters = await db.characters.orderBy('updatedAt').reverse().toArray();
	return characters.filter((row) => visibleTo(row, user)).map(plainCharacter);
}

export async function renameCharacter(id: string, name: string): Promise<void> {
	const character = await getCharacter(id);
	if (character) await saveCharacter({ ...character, name });
}

export async function deleteCharacter(id: string): Promise<void> {
	const db = getDatabase();
	if (!db) return;

	const row = await db.characters.get(id);
	if (!row || !visibleTo(row, await currentUser())) return;
	if (row.ownerId === undefined) {
		await db.characters.delete(id);
		return;
	}
	// Stays as a marker until the cloud knows, so other devices delete theirs too.
	const now = Date.now();
	await db.characters.put({ ...row, deletedAt: now, updatedAt: now, dirty: true });
	onChange();
}

/** Ids of the characters here that are on this device only. */
export async function listDeviceOnlyIds(): Promise<Set<string>> {
	const db = getDatabase();
	if (!db) return new Set();
	const rows = await db.characters.toArray();
	return new Set(rows.filter((row) => row.ownerId === undefined).map((row) => row.id));
}

/** True if this character belongs to the signed-in account. */
export async function isInAccount(id: string): Promise<boolean> {
	const row = await getDatabase()?.characters.get(id);
	return row?.ownerId !== undefined && row.ownerId === (await currentUser());
}

/** The player's choice: move a device-only character into their account. */
export async function moveToAccount(id: string): Promise<void> {
	const db = getDatabase();
	const user = await currentUser();
	if (!db || !user) return;
	const row = await db.characters.get(id);
	if (!row || row.ownerId !== undefined) return;
	await db.characters.put({ ...row, ownerId: user, dirty: true, updatedAt: Date.now() });
	onChange();
}

// ---- used by sync only

/** What sync needs to know about one account's characters. */
export async function syncRows(user: string): Promise<LocalRow[]> {
	const db = getDatabase();
	if (!db) return [];
	const rows = await db.characters.toArray();
	return rows
		.filter((row) => row.ownerId === user)
		.map(({ id, updatedAt, dirty, remoteAt, deletedAt }) => ({ id, updatedAt, dirty: dirty === true, remoteAt, deletedAt }));
}

/** The character and delete time to send up, if it hasn't changed since `updatedAt`. */
export async function rowToPush(id: string): Promise<{ data: Character; updatedAt: number; deletedAt?: number } | undefined> {
	const row = await getDatabase()?.characters.get(id);
	return row && { data: plainCharacter(row), updatedAt: row.updatedAt, deletedAt: row.deletedAt };
}

/**
 * The cloud accepted a save. Marked clean only if nothing changed meanwhile,
 * otherwise a newer edit would never go up. A delete marker is finished with.
 */
export async function markPushed(id: string, sentUpdatedAt: number, remoteAt: number) {
	const db = getDatabase();
	if (!db) return;
	await db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(id);
		if (!row) return;
		if (row.deletedAt && row.updatedAt === sentUpdatedAt) await db.characters.delete(id);
		else await db.characters.put({ ...row, remoteAt, dirty: row.updatedAt !== sentUpdatedAt });
	});
}

/** Copy a cloud character down, unless it was edited here after sync looked. */
export async function applyRemote(user: string, remote: RemoteRow, character: Character, seenUpdatedAt?: number) {
	const db = getDatabase();
	if (!db) return false;
	const existing = await db.characters.get(remote.id);
	if (existing && existing.ownerId !== user) await moveAside(db, existing);
	return db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(remote.id);
		if (row && row.updatedAt !== seenUpdatedAt) return false;
		await db.characters.put({ ...character, id: remote.id, updatedAt: remote.updated_at, ownerId: user, dirty: false, remoteAt: remote.updated_at });
		return true;
	});
}

/** Remove a character the cloud says is gone, unless it was edited after sync looked. */
export async function dropRow(user: string, id: string, seenUpdatedAt: number | undefined) {
	const db = getDatabase();
	if (!db) return false;
	return db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(id);
		if (!row || row.ownerId !== user || row.updatedAt !== seenUpdatedAt) return false;
		await db.characters.delete(id);
		return true;
	});
}

/** Clear safely stored copies of other accounts. Unsaved edits wait for their owner. */
export async function forgetOtherAccounts(user: string | undefined) {
	const db = getDatabase();
	if (!db) return;
	const rows = await db.characters.toArray();
	await db.characters.bulkDelete(
		rows.filter((row) => row.ownerId !== undefined && row.ownerId !== user && !row.dirty).map((row) => row.id)
	);
}
