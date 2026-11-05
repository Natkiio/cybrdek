// Reading and writing lore entries through Supabase (browser only).
// Row-level security decides what each person gets; this file just asks.

import { campaign, VOYAGE_CITY_ID } from '#lib/campaigns/current.svelte.ts';
import { supabase } from '#lib/supabase/client.ts';
import { slugify } from './links.ts';
import type { LoreDraft, LoreEntry } from './types.ts';

// Each campaign has its own offline copy. Voyage City keeps the original key,
// so copies already saved on players' phones carry on working.
const cacheKey = () => (campaign.id === VOYAGE_CITY_ID ? 'cybrdek.lore.v1' : `cybrdek.lore.v1:${campaign.id}`);
const LIST_TIMEOUT_MS = 8000;

export interface LoreList {
	entries: LoreEntry[];
	offline: boolean; // true = served from this device's cache
}

/**
 * Every entry this reader may see. Falls back to the last copy saved on the
 * device when offline. Only visible entries are ever cached, so GM-only lore
 * never sits in a browser's storage after the GM signs out.
 */
export async function listEntries(): Promise<LoreList> {
	// Known offline: don't wait. supabase-js retries a failed GET 3 times with
	// 1 s, 2 s and 4 s waits, which looked like a stuck page.
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return { entries: readCache(), offline: true };
	}
	const { data, error } = await supabase()
		.from('lore_entries')
		.select('*')
		.eq('campaign_id', campaign.id)
		.order('title')
		.abortSignal(AbortSignal.timeout(LIST_TIMEOUT_MS)); // bad signal: give up, use the cache
	if (error || !data) return { entries: readCache(), offline: true };
	const entries = data as LoreEntry[];
	writeCache(entries.filter((e) => e.visible));
	return { entries, offline: false };
}

/** Create or update an entry. Returns the saved row or a readable error. */
export async function saveEntry(
	draft: LoreDraft,
	id?: string
): Promise<{ entry: LoreEntry } | { error: string }> {
	const row = { ...draft, title: draft.title.trim(), slug: slugify(draft.title) };
	const table = supabase().from('lore_entries');
	const { data, error } = await (id ? table.update(row).eq('id', id) : table.insert({ ...row, campaign_id: campaign.id }))
		.select()
		.single();
	if (error) return { error: friendly(error.code, error.message) };
	const entry = data as LoreEntry;
	// Keep this device's copy in step: a hidden entry must leave it at once.
	writeCache(reconcileCache(readCache(), entry.id, entry));
	return { entry };
}

export async function deleteEntry(id: string): Promise<string | null> {
	const { error } = await supabase().from('lore_entries').delete().eq('id', id);
	if (error) return friendly(error.code, error.message);
	writeCache(reconcileCache(readCache(), id, null));
	return null;
}

/**
 * The cached list after one entry changed: replaced if still visible, dropped
 * if hidden or deleted (`entry` null). Kept sorted by title like the server.
 */
export function reconcileCache(cache: LoreEntry[], id: string, entry: LoreEntry | null): LoreEntry[] {
	const others = cache.filter((e) => e.id !== id);
	if (!entry?.visible) return others;
	return [...others, entry].sort((a, b) => a.title.localeCompare(b.title));
}

function friendly(code: string | undefined, message: string): string {
	if (code === '23505') return 'An entry with that title already exists.';
	if (code === '42501' || code === 'PGRST116') return "Only the GM can do that. Are you signed in?";
	return message;
}

function readCache(): LoreEntry[] {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(cacheKey()) ?? '[]');
		return Array.isArray(parsed) ? (parsed as LoreEntry[]).filter((e) => e?.visible === true) : [];
	} catch {
		return [];
	}
}

function writeCache(entries: LoreEntry[]) {
	try {
		localStorage.setItem(cacheKey(), JSON.stringify(entries));
	} catch {
		// Storage full or blocked: the wiki still works online.
	}
}
