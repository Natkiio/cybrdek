// GM-drawn districts and wards, saved per campaign map (map_areas). A map with
// no saved row uses its starting areas: Voyage City's traced ones, or none.
// The last copy read is kept on this device so the map's areas work offline.
import { supabase } from '#lib/supabase/client.ts';
import type { MapArea } from './types.ts';

export interface SavedAreas {
	areas: MapArea[];
	revision: number;
}

const cacheKey = (campaignId: string, mapId: string | null) => `cybrdek:map-areas:${campaignId}:${mapId ?? 'voyage'}`;

function remember(campaignId: string, mapId: string | null, saved: SavedAreas | null) {
	try {
		if (saved) localStorage.setItem(cacheKey(campaignId, mapId), JSON.stringify(saved));
		else localStorage.removeItem(cacheKey(campaignId, mapId));
	} catch {
		// storage blocked: offline just falls back to the starting areas
	}
}

function remembered(campaignId: string, mapId: string | null): SavedAreas | null {
	try {
		const saved = JSON.parse(localStorage.getItem(cacheKey(campaignId, mapId)) ?? 'null');
		return saved && Array.isArray(saved.areas) && typeof saved.revision === 'number' ? saved : null;
	} catch {
		return null;
	}
}

/**
 * The saved areas for a map, or null when the GM hasn't saved any (use the
 * starting areas). Offline, this device's last copy; `offline` says so.
 */
export async function loadAreas(campaignId: string, mapId: string | null): Promise<{ saved: SavedAreas | null; offline: boolean }> {
	let query = supabase().from('map_areas').select('areas, revision').eq('campaign_id', campaignId);
	query = mapId ? query.eq('map_id', mapId) : query.is('map_id', null);
	const { data, error } = await query.maybeSingle();
	if (error) return { saved: remembered(campaignId, mapId), offline: true };
	const saved = data && Array.isArray(data.areas) ? { areas: data.areas as MapArea[], revision: Number(data.revision) } : null;
	remember(campaignId, mapId, saved);
	return { saved, offline: false };
}

/** Save the whole set (GM only). `revision` is the one loaded; 0 when none was saved yet. */
export async function saveAreas(
	campaignId: string,
	mapId: string | null,
	revision: number,
	areas: readonly MapArea[]
): Promise<{ revision: number } | { error: string; conflict?: boolean }> {
	const { data, error } = await supabase().rpc('save_map_areas', {
		campaign: campaignId,
		map: mapId,
		expected_revision: revision,
		list: areas
	});
	if (error) {
		if (error.code === '40001') return { error: 'These areas changed in another tab or device. Reload before editing.', conflict: true };
		if (error.code === '42501') return { error: "Only this campaign's GM can edit its areas." };
		return { error: 'The areas could not be saved. Check your connection and try again.' };
	}
	const next = { areas: [...areas], revision: Number(data) };
	remember(campaignId, mapId, next);
	return { revision: next.revision };
}
