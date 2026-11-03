import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { RulebookDatabase, type StoredRulebook } from './rulebook.ts';
import { buildIndex } from '#lib/rulebook/search.ts';
import { fakePdf } from '../../../tests/fixtures/fake-pdf.ts';

let database: RulebookDatabase;
afterEach(async () => { await database?.delete(); });

it('persists the PDF, index and position together and removes the whole book', async () => {
	const name = `rulebook-test-${crypto.randomUUID()}`;
	database = new RulebookDatabase(name);
	const bytes = fakePdf(['Fictional umbrellas.']);
	const book: StoredRulebook = { id: 'red-core', name: 'fake.pdf',
		pdf: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
		index: buildIndex(['Fictional umbrellas.']), page: 1, savedAt: 123 };
	await database.books.put(book);
	database.close();
	database = new RulebookDatabase(name);
	const saved = await database.books.get('red-core');
	expect(new Uint8Array(await saved!.pdf.arrayBuffer())).toEqual(bytes);
	expect(saved!.index.terms.umbrellas).toEqual([1]);
	await database.books.update('red-core', { page: 2 });
	expect((await database.books.get('red-core'))!.page).toBe(2);
	await database.books.delete('red-core');
	expect(await database.books.count()).toBe(0);
});

it('keeps the previous book if an atomic replacement fails', async () => {
	database = new RulebookDatabase(`rulebook-test-${crypto.randomUUID()}`);
	await database.books.put({ id: 'red-core', name: 'old.pdf', pdf: new Blob(), index: buildIndex(['old']), page: 1, savedAt: 1 });
	await expect(database.transaction('rw', database.books, async () => {
		await database.books.put({ id: 'red-core', name: 'replacement.pdf', pdf: new Blob(), index: buildIndex(['new']), page: 1, savedAt: 2 });
		throw new Error('simulated storage failure');
	})).rejects.toThrow('simulated storage failure');
	expect((await database.books.get('red-core'))!.name).toBe('old.pdf');
});
