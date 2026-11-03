import Dexie, { type Table } from 'dexie';
import type { BookIndex } from '#lib/rulebook/search.ts';

export interface StoredRulebook {
	id: 'red-core';
	name: string;
	pdf: Blob;
	index: BookIndex;
	page: number;
	savedAt: number;
}

/** Separate from characters/backups: book bytes and text never leave this device. */
export class RulebookDatabase extends Dexie {
	books!: Table<StoredRulebook, string>;
	constructor(name = 'cybrdek-rulebook') {
		super(name);
		this.version(1).stores({ books: 'id' });
	}
}

let database: RulebookDatabase | undefined;
function db(): RulebookDatabase {
	if (typeof indexedDB === 'undefined') throw new Error('On-device storage is unavailable in this browser.');
	return database ??= new RulebookDatabase();
}

export const loadRulebook = () => db().books.get('red-core');
/** One atomic replacement: a failed parse/index/save leaves the previous book intact. */
export const saveRulebook = (book: StoredRulebook) => db().books.put(book);
export const removeRulebook = () => db().books.delete('red-core');
export const saveBookPage = (page: number) => db().books.update('red-core', { page });
