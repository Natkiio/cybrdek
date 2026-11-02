import { describe, expect, it } from 'vitest';
import { buildIndex, searchBook, words } from './search.ts';

const index = buildIndex([
	'Violet umbrellas. Violet skies.',
	'The engine needs violet paint.',
	'An umbrella and an engine.'
]);

describe('on-device text index', () => {
	it('keeps source pages and sorted unique page postings', () => {
		expect(index.pages).toHaveLength(3);
		expect(index.terms.violet).toEqual([1, 2]);
	});
	it('matches all query words, ignoring case, punctuation and repeated words', () => {
		expect(searchBook(index, 'VIOLET, engine violet').map((r) => r.page)).toEqual([2]);
		expect(searchBook(index, 'violet umbrella')).toEqual([]); // whole words, not stems
	});
	it('normalizes accents, soft hyphens and words split across lines', () => {
		expect(words('CAFÉ clock-\nwork um\u00adbrella')).toEqual(['cafe', 'clockwork', 'umbrella']);
		expect(searchBook(buildIndex(['CAFÉ clock-\nwork']), 'cafe clockwork')[0].page).toBe(1);
	});
	it('has no matches for empty/unknown queries and bounds results', () => {
		for (const query of ['', '   ', '?!', 'unknown', 'constructor']) expect(searchBook(index, query)).toEqual([]);
		expect(searchBook(index, 'violet', 1).map((r) => r.page)).toEqual([1]);
	});
	it('treats object-key names and markup as ordinary text', () => {
		const special = buildIndex(['constructor __proto__ <script>fiction</script>']);
		expect(searchBook(special, 'constructor')[0].page).toBe(1);
		expect(searchBook(special, 'proto')[0].snippet).toContain('<script>');
	});
	it('returns a short plain-text snippet near the first query word', () => {
		const result = searchBook(buildIndex([`${'filler '.repeat(80)}violet ${'tail '.repeat(80)}`]), 'violet')[0];
		expect(result.snippet).toContain('violet');
		expect(result.snippet.length).toBeLessThanOrEqual(222);
	});
});
