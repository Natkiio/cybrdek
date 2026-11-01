import Dexie, { type Table } from 'dexie';
import type { Character } from '#lib/engine/types.ts';

type StoredCharacter = Character & { updatedAt: number };

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

function withoutTimestamp({ updatedAt: _updatedAt, ...character }: StoredCharacter): Character {
	return character;
}

export async function saveCharacter(character: Character): Promise<void> {
	const db = getDatabase();
	// Saving must never silently fail, or the wizard would open a character that doesn't exist.
	if (!db) throw new Error('This browser has no on-device storage (IndexedDB).');

	await db.characters.put({ ...cloneCharacter(character), updatedAt: Date.now() });
}

export async function getCharacter(id: string): Promise<Character | undefined> {
	const db = getDatabase();
	if (!db) return undefined;

	const character = await db.characters.get(id);
	return character ? withoutTimestamp(character) : undefined;
}

export async function listCharacters(): Promise<Character[]> {
	const db = getDatabase();
	if (!db) return [];

	const characters = await db.characters.orderBy('updatedAt').reverse().toArray();
	return characters.map(withoutTimestamp);
}

export async function renameCharacter(id: string, name: string): Promise<void> {
	const db = getDatabase();
	if (!db) return;

	const character = await db.characters.get(id);
	if (!character) return;

	await db.characters.put({ ...character, name, updatedAt: Date.now() });
}

export async function deleteCharacter(id: string): Promise<void> {
	const db = getDatabase();
	if (!db) return;

	await db.characters.delete(id);
}
