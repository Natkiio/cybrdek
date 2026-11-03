// Markdown → safe HTML for an entry body (browser only: DOMPurify needs a DOM).

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { resolveWikilinks } from './links.ts';

/**
 * Render a body. [[links]] become links only for entries in `known`; the HTML
 * is then sanitised, so even GM-typed HTML can't run scripts in a player's app.
 */
export function renderBody(body: string, known: ReadonlySet<string>): string {
	const html = marked.parse(resolveWikilinks(body, known), { async: false, gfm: true, breaks: true });
	return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
