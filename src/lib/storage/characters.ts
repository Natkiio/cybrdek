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
	// Changes on every write. Sync compares it, not times: two edits in the
	// same millisecond still differ, so an in-flight sync can't mistake them.
	rev?: string;
};

const newRev = () => crypto.randomUUID();

/** Sync passes this so a write is skipped once the signed-in account has moved on. */
export type StillCurrent = () => boolean;

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
	const { updatedAt: _u, ownerId: _o, dirty: _d, remoteAt: _r, deletedAt: _t, rev: _v, ...character } = row;
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
	const copy = cloneCharacter(character);
	const ownerId = await db.transaction('rw', db.characters, async () => {
		const existing = await db.characters.get(copy.id);
		if (existing?.ownerId !== undefined && existing.ownerId !== user) await moveAside(db, existing);
		const kept = existing?.ownerId === user ? existing : undefined;
		// New characters join the account. An older device-only one waits for moveToAccount.
		const owner = kept?.ownerId ?? (existing && existing.ownerId === undefined ? undefined : user);
		await db.characters.put({
			...copy,
			updatedAt: Date.now(),
			rev: newRev(),
			...(owner ? { ownerId: owner, dirty: true, remoteAt: kept?.remoteAt } : {})
		});
		return owner;
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
			rev: newRev(),
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

	const user = await currentUser();
	const marked = await db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(id);
		if (!row || !visibleTo(row, user)) return false;
		if (row.ownerId === undefined) {
			await db.characters.delete(id);
			return false;
		}
		// Stays as a marker until the cloud knows, so other devices delete theirs too.
		const now = Date.now();
		await db.characters.put({ ...row, deletedAt: now, updatedAt: now, dirty: true, rev: newRev() });
		return true;
	});
	if (marked) onChange();
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
	const moved = await db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(id);
		if (!row || row.ownerId !== undefined) return false;
		await db.characters.put({ ...row, ownerId: user, dirty: true, updatedAt: Date.now(), rev: newRev() });
		return true;
	});
	if (moved) onChange();
}

// ---- used by sync only. Each write takes the account it was planned for and
// a StillCurrent check, made inside the transaction just before writing.

export type SyncRow = LocalRow & { rev?: string };

/** What sync needs to know about one account's characters. */
export async function syncRows(user: string): Promise<SyncRow[]> {
	const db = getDatabase();
	if (!db) return [];
	const rows = await db.characters.toArray();
	return rows
		.filter((row) => row.ownerId === user)
		.map(({ id, updatedAt, dirty, remoteAt, deletedAt, rev }) => ({
			id, updatedAt, dirty: dirty === true, remoteAt, deletedAt, rev
		}));
}

/**
 * The character and delete time to send up, read in one go. Undefined if the
 * row changed since sync planned it (`rev`) or isn't this account's: the
 * caller plans again rather than sending a newer copy under an older time.
 */
export async function rowToPush(
	user: string,
	id: string,
	rev: string | undefined
): Promise<{ data: Character; deletedAt?: number } | undefined> {
	const row = await getDatabase()?.characters.get(id);
	if (!row || row.ownerId !== user || row.rev !== rev) return undefined;
	return { data: plainCharacter(row), deletedAt: row.deletedAt };
}

/**
 * The cloud accepted a save. Marked clean only if nothing changed meanwhile,
 * otherwise a newer edit would never go up. A delete marker is finished with.
 */
export async function markPushed(user: string, id: string, sentRev: string | undefined, remoteAt: number, current: StillCurrent) {
	const db = getDatabase();
	if (!db) return;
	await db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(id);
		if (!row || row.ownerId !== user || !current()) return;
		const same = row.rev === sentRev;
		if (row.deletedAt && same) await db.characters.delete(id);
		else await db.characters.put({ ...row, remoteAt, dirty: !same });
	});
}

/** Copy a cloud character down, unless it was edited here after sync looked. */
export async function applyRemote(user: string, remote: RemoteRow, character: Character, seenRev: string | undefined, current: StillCurrent) {
	const db = getDatabase();
	if (!db) return false;
	return db.transaction('rw', db.characters, async () => {
		const existing = await db.characters.get(remote.id);
		if (!current()) return false;
		if (existing && existing.ownerId !== user) {
			// Someone else's copy with this id (a shared backup): keep it, under a new id.
			await moveAside(db, existing);
		} else if (existing && existing.rev !== seenRev) {
			return false;
		}
		await db.characters.put({
			...character,
			id: remote.id,
			updatedAt: remote.updated_at,
			ownerId: user,
			dirty: false,
			remoteAt: remote.updated_at,
			rev: newRev()
		});
		return true;
	});
}

/** Remove a character the cloud says is gone, unless it was edited after sync looked. */
export async function dropRow(user: string, id: string, seenRev: string | undefined, current: StillCurrent) {
	const db = getDatabase();
	if (!db) return false;
	return db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(id);
		if (!row || row.ownerId !== user || row.rev !== seenRev || !current()) return false;
		await db.characters.delete(id);
		return true;
	});
}

/**
 * Clear safely stored copies of other accounts. Unsaved edits wait for their
 * owner. Checked and deleted in one transaction, so an edit made meanwhile stays.
 */
export async function forgetOtherAccounts(user: string | undefined, current: StillCurrent = () => true) {
	const db = getDatabase();
	if (!db) return;
	await db.transaction('rw', db.characters, async () => {
		const rows = await db.characters.toArray();
		if (!current()) return;
		await db.characters.bulkDelete(
			rows.filter((row) => row.ownerId !== undefined && row.ownerId !== user && !row.dirty).map((row) => row.id)
		);
	});
}

/** null means the account character is not on this device; false means not yet accepted. */
export async function hasOwnedReceipt(owner: string, id: string, key: string): Promise<boolean | null> {
	if ((await currentUser()) !== owner) return null;
	const row = await getDatabase()?.characters.get(id);
	if (!row || row.ownerId !== owner || row.deletedAt) return null;
	const receipts = row.extra.acceptedChanges;
	return !!receipts && typeof receipts === 'object' && Object.hasOwn(receipts, key);
}

/** An explicit owner choice: update data and receipt in one local write transaction. */
export async function updateOwnedCharacterOnce(owner: string, id: string, key: string,
	change: (character: Character) => Character, current: StillCurrent = () => true): Promise<boolean> {
	if ((await currentUser()) !== owner || !current()) throw new Error('Sign in to the character owner’s account first.');
	const db = getDatabase();
	if (!db) throw new Error('On-device storage is unavailable.');
	const changed = await db.transaction('rw', db.characters, async () => {
		const row = await db.characters.get(id);
		if (!current() || !row || row.ownerId !== owner || row.deletedAt) throw new Error('This character is not available in your account.');
		const receipts = row.extra.acceptedChanges && typeof row.extra.acceptedChanges === 'object'
			&& !Array.isArray(row.extra.acceptedChanges) ? row.extra.acceptedChanges as Record<string, unknown> : {};
		if (Object.hasOwn(receipts, key)) return false;
		const next = cloneCharacter(change(cloneCharacter(plainCharacter(row))));
		await db.characters.put({ ...next, id: row.id, ownerId: owner, remoteAt: row.remoteAt,
			updatedAt: Date.now(), rev: newRev(), dirty: true,
			extra: { ...next.extra, acceptedChanges: { ...receipts, [key]: true } } });
		return true;
	});
	if (changed) onChange();
	return changed;
}
