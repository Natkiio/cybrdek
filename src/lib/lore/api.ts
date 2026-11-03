// Reading and writing lore entries through Supabase (browser only).
// Row-level security decides what each person gets; this file just asks.

import { supabase } from '#lib/supabase/client.ts';
import { slugify } from './links.ts';
import type { LoreDraft, LoreEntry } from './types.ts';

const CACHE_KEY = 'cybrdek.lore.v1';

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
	const { data, error } = await supabase().from('lore_entries').select('*').order('title');
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
	const { data, error } = await (id ? table.update(row).eq('id', id) : table.insert(row)).select().single();
	if (error) return { error: friendly(error.code, error.message) };
	return { entry: data as LoreEntry };
}

export async function deleteEntry(id: string): Promise<string | null> {
	const { error } = await supabase().from('lore_entries').delete().eq('id', id);
	return error ? friendly(error.code, error.message) : null;
}

function friendly(code: string | undefined, message: string): string {
	if (code === '23505') return 'An entry with that title already exists.';
	if (code === '42501' || code === 'PGRST116') return "Only the GM can do that. Are you signed in?";
	return message;
}

function readCache(): LoreEntry[] {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
		return Array.isArray(parsed) ? (parsed as LoreEntry[]).filter((e) => e?.visible === true) : [];
	} catch {
		return [];
	}
}

function writeCache(entries: LoreEntry[]) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
	} catch {
		// Storage full or blocked: the wiki still works online.
	}
}
