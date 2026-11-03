import { describe, expect, it } from 'vitest';
import { backlinks, linkedSlugs, resolveWikilinks, searchEntries, slugify, validateDraft } from './links.ts';
import type { LoreEntry } from './types.ts';

function entry(title: string, body = '', extra: Partial<LoreEntry> = {}): LoreEntry {
	return {
		id: title,
		slug: slugify(title),
		title,
		type: 'other',
		summary: '',
		body,
		visible: true,
		created_at: '',
		updated_at: '',
		...extra
	};
}

describe('slugify', () => {
	it.each([
		["Topaz's Bar", 'topazs-bar'],
		['  Central Point  ', 'central-point'],
		['Arma-Corp', 'arma-corp'],
		['Café Noir', 'cafe-noir'],
		['VCPD / Precinct 9', 'vcpd-precinct-9'],
		['!!!', '']
	])('%s → %s', (title, slug) => {
		expect(slugify(title)).toBe(slug);
	});

	it('always produces what the database slug check accepts', () => {
		for (const t of ["Fargo Dyne", 'X', '2128 Heist', '--a--b--']) {
			expect(slugify(t)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});
});

describe('wikilinks', () => {
	const known = new Set(['fargo-dyne', 'araki']);

	it('links entries the reader can see, with optional labels', () => {
		expect(resolveWikilinks('Ask [[Fargo Dyne]] in [[Araki|the district]].', known)).toBe(
			'Ask [Fargo Dyne](/lore/fargo-dyne) in [the district](/lore/araki).'
		);
	});

	it('turns links to unknown or hidden entries into plain text', () => {
		expect(resolveWikilinks('The [[Secret Plan]] is ready.', known)).toBe('The Secret Plan is ready.');
	});

	it('escapes link text so it cannot inject Markdown or HTML', () => {
		expect(resolveWikilinks('[[<img src=x onerror=alert(1)>]]', known)).toBe('\\<img src=x onerror=alert\\(1\\)\\>');
	});

	it('lists linked slugs once', () => {
		expect(linkedSlugs('[[Araki]], [[araki]] and [[Fargo Dyne|Fargo]]')).toEqual(['araki', 'fargo-dyne']);
	});
});

describe('backlinks', () => {
	it('finds entries that link here, not the entry itself', () => {
		const entries = [
			entry('Gecko', 'Works for [[Fargo Dyne]].'),
			entry('Fargo Dyne', 'Himself: [[Fargo Dyne]].'),
			entry('Araki', 'Home of [[Fargo Dyne|Fargo]].'),
			entry('Bowetown', 'No links.')
		];
		expect(backlinks(entries, 'fargo-dyne').map((e) => e.title)).toEqual(['Araki', 'Gecko']);
	});
});

describe('searchEntries', () => {
	const entries = [
		entry('Araki', 'Corp war zone.', { type: 'location' }),
		entry('Gecko', 'A netrunner from Araki.', { type: 'character' }),
		entry('Arma-Corp', '', { type: 'faction', summary: 'Weapons maker' })
	];

	it('ranks title matches before body matches', () => {
		expect(searchEntries(entries, 'araki').map((e) => e.title)).toEqual(['Araki', 'Gecko']);
	});

	it('searches summaries, filters by type, and lists all by title when empty', () => {
		expect(searchEntries(entries, 'weapons').map((e) => e.title)).toEqual(['Arma-Corp']);
		expect(searchEntries(entries, '', 'character').map((e) => e.title)).toEqual(['Gecko']);
		expect(searchEntries(entries, '').map((e) => e.title)).toEqual(['Araki', 'Arma-Corp', 'Gecko']);
	});
});

describe('validateDraft', () => {
	const ok = { title: 'Araki', type: 'location' as const, summary: '', body: '', visible: false };

	it('accepts a good draft', () => {
		expect(validateDraft(ok)).toEqual([]);
	});

	it('needs a usable title, a known type and a short summary', () => {
		expect(validateDraft({ ...ok, title: '  ' })).toContain('Give the entry a title.');
		expect(validateDraft({ ...ok, title: '???' })).toContain('The title needs at least one letter or number.');
		expect(validateDraft({ ...ok, type: 'planet' as never })).toContain('Pick a type.');
		expect(validateDraft({ ...ok, summary: 'x'.repeat(281) })).toHaveLength(1);
	});
});
