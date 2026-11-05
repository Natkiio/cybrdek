// MP-1 (#39): GM pins and district overrides on the city map.
// Pure helpers first (tested); Supabase calls at the bottom (browser only).

import { campaign } from '#lib/campaigns/current.svelte.ts';
import { supabase } from '#lib/supabase/client.ts';
import type { LoreEntry } from '#lib/lore/types.ts';
import { MAP_HEIGHT, MAP_WIDTH, type District } from './districts.ts';
import { containsPoint } from './geometry.ts';

export const PIN_LABEL_MAX = 80;

/** Kinds of place a pin can be. Must match the check in 20261103150000_pin_category.sql. */
export const PIN_CATEGORIES = [
	'bar',
	'club',
	'shop',
	'food',
	'home',
	'clinic',
	'corp',
	'gang',
	'fixer',
	'landmark',
	'other'
] as const;
export type PinCategory = (typeof PIN_CATEGORIES)[number];

export const PIN_CATEGORY_LABELS: Record<PinCategory, string> = {
	bar: 'Bar / pub',
	club: 'Club',
	shop: 'Shop',
	food: 'Food',
	home: 'Home (NPC)',
	clinic: 'Clinic / ripperdoc',
	corp: 'Corp building',
	gang: 'Gang turf',
	fixer: 'Fixer spot',
	landmark: 'Landmark',
	other: 'Other'
};

export interface MapPin {
	id: string;
	x: number;
	y: number;
	label: string;
	lore_entry_id: string | null;
	visible: boolean;
	category: PinCategory;
}

export type PinDraft = Omit<MapPin, 'id'>;

export interface DistrictOverride {
	district_id: string;
	name: string | null;
	lore_entry_id: string | null;
}

/** The bits of a traced district this file needs (shapes live in districts.ts). */
export interface DistrictLike {
	id: string;
	name: string;
	loreSlug?: string;
}

/** Keep a point on the map image. */
export function clampToMap(x: number, y: number): { x: number; y: number } {
	const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));
	return { x: clamp(x, MAP_WIDTH), y: clamp(y, MAP_HEIGHT) };
}

/** Problems with a pin draft, in plain words. Empty = OK to save. */
export function validatePin(draft: PinDraft): string[] {
	const problems: string[] = [];
	const label = draft.label.trim();
	if (!label) problems.push('Give the pin a name.');
	else if (label.length > PIN_LABEL_MAX) problems.push(`Keep the name under ${PIN_LABEL_MAX} characters.`);
	if (!(draft.x >= 0 && draft.x <= MAP_WIDTH && draft.y >= 0 && draft.y <= MAP_HEIGHT)) {
		problems.push('The pin must be on the map.');
	}
	return problems;
}

/**
 * What a reader sees for a district: the GM's name if set, and a lore link
 * only to an entry this reader can see. The GM's chosen entry wins; otherwise
 * the district's default slug links if an entry with that slug exists.
 */
export function resolveDistrict(
	district: DistrictLike,
	override: DistrictOverride | undefined,
	entries: readonly LoreEntry[]
): { name: string; lore: LoreEntry | null } {
	const name = override?.name?.trim() || district.name;
	if (override?.lore_entry_id) {
		return { name, lore: entries.find((e) => e.id === override.lore_entry_id) ?? null };
	}
	const slug = district.loreSlug;
	return { name, lore: (slug && entries.find((e) => e.slug === slug)) || null };
}

/** The lore entry a pin links to, if this reader can see it. */
export function pinLore(pin: MapPin, entries: readonly LoreEntry[]): LoreEntry | null {
	return pin.lore_entry_id ? (entries.find((e) => e.id === pin.lore_entry_id) ?? null) : null;
}

// ---- Supabase ---------------------------------------------------------------

export async function listPins(): Promise<MapPin[]> {
	const { data, error } = await supabase().from('map_pins').select('id,x,y,label,lore_entry_id,visible,category').eq('campaign_id', campaign.id);
	return error || !data ? [] : (data as MapPin[]);
}

export async function listDistrictOverrides(): Promise<DistrictOverride[]> {
	const { data, error } = await supabase().from('map_districts').select('district_id,name,lore_entry_id').eq('campaign_id', campaign.id);
	return error || !data ? [] : (data as DistrictOverride[]);
}

export async function savePin(draft: PinDraft, id?: string): Promise<{ pin: MapPin } | { error: string }> {
	const row = { ...draft, label: draft.label.trim(), ...clampToMap(draft.x, draft.y) };
	const table = supabase().from('map_pins');
	const { data, error } = await (id ? table.update(row).eq('id', id) : table.insert({ ...row, campaign_id: campaign.id }))
		.select('id,x,y,label,lore_entry_id,visible,category')
		.single();
	return error ? { error: error.message } : { pin: data as MapPin };
}

export async function deletePin(id: string): Promise<string | null> {
	const { error } = await supabase().from('map_pins').delete().eq('id', id);
	return error ? error.message : null;
}

export async function saveDistrictOverride(override: DistrictOverride): Promise<string | null> {
	const { error } = await supabase()
		.from('map_districts')
		.upsert({ ...override, name: override.name?.trim() || null, campaign_id: campaign.id }, { onConflict: 'campaign_id,district_id' });
	return error ? error.message : null;
}

// ---- the district menu: district → wards → places ----------------------------

export interface WardPlaces {
	ward: District;
	places: MapPin[];
}

export interface DistrictPlaces {
	district: District;
	wards: WardPlaces[]; // every ward of the district, even empty ones
	elsewhere: MapPin[]; // in the district but in no ward
}

const byLabel = (a: MapPin, b: MapPin) => a.label.localeCompare(b.label);

/**
 * Sort pins into a district's wards by where they sit on the map, so the GM
 * never has to file a pin by hand. A pin in two overlapping wards goes to the
 * smaller one (same rule as tapping the map).
 */
export function placesInDistrict(
	district: District,
	districts: readonly District[],
	pins: readonly MapPin[]
): DistrictPlaces {
	const wards = districts.filter((d) => d.kind === 'ward' && d.parentId === district.id);
	const area = (d: District) =>
		Math.abs(d.polygon.reduce((sum, [x, y], i) => {
			const [nx, ny] = d.polygon[(i + 1) % d.polygon.length];
			return sum + x * ny - nx * y;
		}, 0)) / 2;
	const bySize = [...wards].sort((a, b) => area(a) - area(b));
	const result = new Map(wards.map((w) => [w.id, [] as MapPin[]]));
	const elsewhere: MapPin[] = [];
	for (const pin of pins) {
		const point = [pin.x, pin.y] as const;
		const ward = bySize.find((w) => containsPoint(w.polygon, point));
		if (ward) result.get(ward.id)!.push(pin);
		else if (containsPoint(district.polygon, point)) elsewhere.push(pin);
	}
	return {
		district,
		wards: wards
			.map((ward) => ({ ward, places: result.get(ward.id)!.sort(byLabel) }))
			.sort((a, b) => a.ward.name.localeCompare(b.ward.name)),
		elsewhere: elsewhere.sort(byLabel)
	};
}

/** The district a district-or-ward belongs to (itself, or a ward's parent). */
export function districtOf(area: District, districts: readonly District[]): District {
	return area.kind === 'ward' ? (districts.find((d) => d.id === area.parentId) ?? area) : area;
}
