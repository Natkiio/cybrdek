// Reading and writing lore entries through Supabase (browser only).
// Row-level security decides what each person gets; this file just asks.

import { campaign, VOYAGE_CITY_ID } from '#lib/campaigns/current.svelte.ts';
import { supabase } from '#lib/supabase/client.ts';
import { slugify } from './links.ts';
import type { LoreDraft, LoreEntry } from './types.ts';

const VOYAGE_CACHE_KEY = 'cybrdek.lore.v1';
const PRIVATE_CACHE_PREFIX = `${VOYAGE_CACHE_KEY}:`;
const LIST_TIMEOUT_MS = 8000;

/**
 * Where this reader's offline copy lives, or null if they may not have one.
 * Voyage City is public and keeps the original key, so copies already saved on
 * players' phones carry on working. Any other campaign's "visible" lore is for
 * its members only, so its copy belongs to one account: nobody signed out, and
 * no other account on this device, can read it.
 */
async function cacheKey(): Promise<string | null> {
	if (campaign.id === VOYAGE_CITY_ID) return VOYAGE_CACHE_KEY;
	const { data } = await supabase().auth.getSession();
	const userId = data.session?.user.id;
	return userId ? `${PRIVATE_CACHE_PREFIX}${campaign.id}:${userId}` : null;
}

/** Remove every private campaign's offline copy from this device (on sign-out). */
export function clearPrivateCaches() {
	try {
		const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
		for (const key of keys) if (key?.startsWith(PRIVATE_CACHE_PREFIX)) localStorage.removeItem(key);
	} catch {
		// Storage blocked: nothing was saved there either.
	}
}

export interface LoreList {
	entries: LoreEntry[];
	offline: boolean; // true = served from this device's cache
}

/**
 * Every entry this reader may see. Falls back to the last copy saved on the
 * device when offline. Only visible entries are ever cached, so GM-only lore
 * never sits in a browser's storage after the GM signs out. See cacheKey() for
 * who may read a copy.
 */
export async function listEntries(): Promise<LoreList> {
	const key = await cacheKey();
	// Known offline: don't wait. supabase-js retries a failed GET 3 times with
	// 1 s, 2 s and 4 s waits, which looked like a stuck page.
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return { entries: readCache(key), offline: true };
	}
	const { data, error } = await supabase()
		.from('lore_entries')
		.select('*')
		.eq('campaign_id', campaign.id)
		.order('title')
		.abortSignal(AbortSignal.timeout(LIST_TIMEOUT_MS)); // bad signal: give up, use the cache
	if (error || !data) return { entries: readCache(key), offline: true };
	const entries = data as LoreEntry[];
	writeCache(key, entries.filter((e) => e.visible));
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
	const key = await cacheKey();
	writeCache(key, reconcileCache(readCache(key), entry.id, entry));
	return { entry };
}

export async function deleteEntry(id: string): Promise<string | null> {
	const { error } = await supabase().from('lore_entries').delete().eq('id', id);
	if (error) return friendly(error.code, error.message);
	const key = await cacheKey();
	writeCache(key, reconcileCache(readCache(key), id, null));
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

function readCache(key: string | null): LoreEntry[] {
	if (!key) return [];
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
		return Array.isArray(parsed) ? (parsed as LoreEntry[]).filter((e) => e?.visible === true) : [];
	} catch {
		return [];
	}
}

function writeCache(key: string | null, entries: LoreEntry[]) {
	if (!key) return;
	try {
		localStorage.setItem(key, JSON.stringify(entries));
	} catch {
		// Storage full or blocked: the wiki still works online.
	}
}
