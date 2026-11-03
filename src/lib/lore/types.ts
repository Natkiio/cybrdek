// LR-1 (#38): one lore wiki entry, as stored in public.lore_entries.

export const LORE_TYPES = ['character', 'location', 'faction', 'event', 'other'] as const;
export type LoreType = (typeof LORE_TYPES)[number];

export const LORE_TYPE_LABELS: Record<LoreType, string> = {
	character: 'Character',
	location: 'Location',
	faction: 'Faction / Corp',
	event: 'Event',
	other: 'Other'
};

export interface LoreEntry {
	id: string;
	slug: string;
	title: string;
	type: LoreType;
	summary: string;
	body: string;
	visible: boolean; // false = GM only
	created_at: string;
	updated_at: string;
}

/** What the GM edits; the database fills in the rest. */
export type LoreDraft = Pick<LoreEntry, 'title' | 'type' | 'summary' | 'body' | 'visible'>;

export const TITLE_MAX = 120;
export const SUMMARY_MAX = 280;
