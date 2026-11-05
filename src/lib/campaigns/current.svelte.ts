// Which campaign this device is looking at (CP-1, #60). A shared reactive
// object, like `gm`. Voyage City is the public default, so someone with no
// account still sees what they always did.

export const VOYAGE_CITY_ID = '00000000-0000-4000-8000-000000000001';
const STORAGE_KEY = 'cybrdek:campaign';

export interface CurrentCampaign {
	id: string;
	name: string;
}

const fallback: CurrentCampaign = { id: VOYAGE_CITY_ID, name: 'Voyage City' };

function saved(): CurrentCampaign {
	if (typeof localStorage === 'undefined') return fallback;
	try {
		const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
		return typeof value?.id === 'string' && typeof value?.name === 'string' ? value : fallback;
	} catch {
		return fallback;
	}
}

export const campaign = $state<CurrentCampaign>(saved());

/**
 * Switch campaign. Reloads the page on purpose: every page starts clean, so
 * nothing from the last campaign (hidden lore included) can stay on screen.
 */
export function switchCampaign(next: CurrentCampaign, path = '/campaigns') {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: next.id, name: next.name }));
	} catch {
		// Storage blocked: the switch lasts until the next reload.
	}
	location.assign(path);
}
