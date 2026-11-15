// Cache Storage names (#62, #101). The service worker clears old app caches on
// update; caches holding data the app saved for offline use must survive that.

/** Offline copies of campaign map images (src/lib/map/campaign-maps.ts). */
export const MAP_CACHE = 'cybrdek-campaign-maps';

const DATA_CACHES = new Set([MAP_CACHE]);

/** The caches a newly activated service worker should delete: old app versions only. */
export function staleAppCaches(keys: readonly string[], current: string): string[] {
	return keys.filter((key) => key !== current && key.startsWith('cybrdek-') && !DATA_CACHES.has(key));
}
