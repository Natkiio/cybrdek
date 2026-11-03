// Wiki logic with no browser or network: slugs, [[links]], backlinks, search.
// Kept pure so it is easy to test.

import { LORE_TYPES, SUMMARY_MAX, TITLE_MAX, type LoreDraft, type LoreEntry, type LoreType } from './types.ts';

/** "Topaz's Bar" → "topazs-bar". Matches the slug check in the database. */
export function slugify(title: string): string {
	return title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // drop accents
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Matches [[Target]] and [[Target|shown text]]. */
const WIKILINK = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g;

/** The titles an entry's body links to, as slugs, without duplicates. */
export function linkedSlugs(body: string): string[] {
	return [...new Set([...body.matchAll(WIKILINK)].map((m) => slugify(m[1])).filter(Boolean))];
}

/** Escape text so it can't become Markdown or HTML. */
function escapeText(text: string): string {
	return text.replace(/[\\`*_{}[\]()#+!<>&|~-]/g, (c) => `\\${c}`);
}

/**
 * Turn [[links]] into Markdown links for entries the reader can see. Links to
 * entries they can't see (hidden or not written yet) become plain text, so a
 * player can't even learn the slug of a hidden entry.
 */
export function resolveWikilinks(body: string, known: ReadonlySet<string>): string {
	return body.replace(WIKILINK, (_match, target: string, label?: string) => {
		const shown = escapeText((label ?? target).trim());
		const slug = slugify(target);
		return known.has(slug) ? `[${shown}](/lore/${slug})` : shown;
	});
}

/** Entries whose body links to `slug`, sorted by title. */
export function backlinks(entries: readonly LoreEntry[], slug: string): LoreEntry[] {
	return entries
		.filter((e) => e.slug !== slug && linkedSlugs(e.body).includes(slug))
		.sort((a, b) => a.title.localeCompare(b.title));
}

/** Search title, summary and body; optional type filter. Title matches first. */
export function searchEntries(
	entries: readonly LoreEntry[],
	query: string,
	type: LoreType | 'all' = 'all'
): LoreEntry[] {
	const q = query.trim().toLowerCase();
	const pool = entries.filter((e) => type === 'all' || e.type === type);
	if (!q) return [...pool].sort((a, b) => a.title.localeCompare(b.title));
	const score = (e: LoreEntry) =>
		e.title.toLowerCase().includes(q) ? 0 : e.summary.toLowerCase().includes(q) ? 1 : e.body.toLowerCase().includes(q) ? 2 : -1;
	return pool
		.map((e) => ({ e, s: score(e) }))
		.filter((x) => x.s >= 0)
		.sort((a, b) => a.s - b.s || a.e.title.localeCompare(b.e.title))
		.map((x) => x.e);
}

/** Problems with a draft, in plain words. Empty = OK to save. */
export function validateDraft(draft: LoreDraft): string[] {
	const problems: string[] = [];
	const title = draft.title.trim();
	if (!title) problems.push('Give the entry a title.');
	else if (title.length > TITLE_MAX) problems.push(`Keep the title under ${TITLE_MAX} characters.`);
	else if (!slugify(title)) problems.push('The title needs at least one letter or number.');
	if (!LORE_TYPES.includes(draft.type)) problems.push('Pick a type.');
	if (draft.summary.length > SUMMARY_MAX) problems.push(`Keep the summary under ${SUMMARY_MAX} characters.`);
	return problems;
}
