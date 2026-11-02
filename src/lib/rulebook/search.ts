export const INDEX_VERSION = 1;

export interface BookIndex {
	version: typeof INDEX_VERSION;
	pages: string[];
	/** Normalized word → sorted, one-based PDF page numbers. Stored only in IndexedDB. */
	terms: Record<string, number[]>;
}

export function words(text: string): string[] {
	return text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\u00ad/g, '')
		.replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function buildIndex(pages: string[]): BookIndex {
	const terms: Record<string, number[]> = Object.create(null);
	pages.forEach((text, offset) => {
		for (const word of new Set(words(text))) (terms[word] ??= []).push(offset + 1);
	});
	return { version: INDEX_VERSION, pages, terms };
}

export interface SearchResult { page: number; snippet: string }

/** All query words must occur on a page. No regex/HTML supplied by the user is executed. */
export function searchBook(index: BookIndex, query: string, limit = 50): SearchResult[] {
	const queryWords = [...new Set(words(query))];
	if (!queryWords.length || limit < 1) return [];
	const lists = queryWords.map((word) => Object.hasOwn(index.terms, word) ? index.terms[word] : []);
	lists.sort((a, b) => a.length - b.length);
	const otherPages = lists.slice(1).map((list) => new Set(list));
	return lists[0].filter((page) => otherPages.every((set) => set.has(page))).slice(0, limit)
		.map((page) => {
			const text = index.pages[page - 1].replace(/\s+/g, ' ').trim();
			const match = text.toLowerCase().indexOf(queryWords[0]);
			const start = Math.max(0, match - 60);
			return { page, snippet: `${start ? '…' : ''}${text.slice(start, start + 220)}${text.length > start + 220 ? '…' : ''}` };
		});
}
