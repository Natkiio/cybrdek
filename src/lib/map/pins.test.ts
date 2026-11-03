import { describe, expect, it } from 'vitest';
import type { LoreEntry } from '#lib/lore/types.ts';
import type { District } from './districts.ts';
import { clampToMap, districtOf, pinLore, placesInDistrict, resolveDistrict, validatePin, type MapPin } from './pins.ts';

const lore = (id: string, slug: string): LoreEntry => ({
	id,
	slug,
	title: slug,
	type: 'location',
	summary: '',
	body: '',
	visible: true,
	created_at: '',
	updated_at: ''
});

// What a player sees: Akiba's entry is visible; a hidden entry isn't in the list.
const entries = [lore('e-akiba', 'akiba'), lore('e-topaz', 'topazs-bar')];
const akiba = { id: 'akiba', name: 'Akiba', loreSlug: 'akiba' };
const square = (x: number, y: number, size: number) =>
	[[x, y], [x + size, y], [x + size, y + size], [x, y + size]] as const;

describe('resolveDistrict', () => {
	it('uses the traced name and links the matching entry by default', () => {
		expect(resolveDistrict(akiba, undefined, entries)).toEqual({ name: 'Akiba', lore: entries[0] });
	});

	it("uses the GM's name and chosen entry when set", () => {
		const override = { district_id: 'akiba', name: 'Araki', lore_entry_id: 'e-topaz' };
		expect(resolveDistrict(akiba, override, entries)).toEqual({ name: 'Araki', lore: entries[1] });
	});

	it('shows no link when the chosen entry is hidden from this reader', () => {
		const override = { district_id: 'akiba', name: null, lore_entry_id: 'e-hidden' };
		expect(resolveDistrict(akiba, override, entries)).toEqual({ name: 'Akiba', lore: null });
	});

	it('shows no link when no entry has the default slug, and ignores a blank name', () => {
		const override = { district_id: 'bowetown', name: '  ', lore_entry_id: null };
		expect(resolveDistrict({ id: 'bowetown', name: 'Bowetown', loreSlug: 'bowetown' }, override, entries)).toEqual({
			name: 'Bowetown',
			lore: null
		});
	});
});

describe('pins', () => {
	const pin: MapPin = { id: 'p', x: 10, y: 20, label: "Topaz's Bar", lore_entry_id: 'e-topaz', visible: true, category: 'bar' };

	it('links a pin only to an entry the reader can see', () => {
		expect(pinLore(pin, entries)).toBe(entries[1]);
		expect(pinLore({ ...pin, lore_entry_id: 'e-hidden' }, entries)).toBeNull();
		expect(pinLore({ ...pin, lore_entry_id: null }, entries)).toBeNull();
	});

	it('keeps pins on the 3840 × 2160 map', () => {
		expect(clampToMap(-5, 99999)).toEqual({ x: 0, y: 2160 });
		expect(clampToMap(Number.NaN, 100)).toEqual({ x: 0, y: 100 });
	});

	it('validates the name and position', () => {
		const { id: _id, ...draft } = pin;
		expect(validatePin(draft)).toEqual([]);
		expect(validatePin({ ...draft, label: ' ' })).toEqual(['Give the pin a name.']);
		expect(validatePin({ ...draft, x: 4000 })).toEqual(['The pin must be on the map.']);
		expect(validatePin({ ...draft, label: 'x'.repeat(81) })).toHaveLength(1);
	});
});

describe('placesInDistrict', () => {
	// A 1000×1000 district with two wards; the small ward sits inside the big one.
	const area = (id: string, kind: 'district' | 'ward', polygon: readonly (readonly [number, number])[], parentId?: string): District => ({
		id, name: id, loreSlug: id, polygon, label: polygon[0], boundary: 'marked', kind, parentId
	});
	const district = area('dist', 'district', square(0, 0, 1000));
	const bigWard = area('big', 'ward', square(0, 0, 500), 'dist');
	const smallWard = area('small', 'ward', square(100, 100, 100), 'dist');
	const otherWard = area('other', 'ward', square(2000, 2000, 100), 'elsewhere');
	const all = [district, bigWard, smallWard, otherWard];
	const at = (label: string, x: number, y: number): MapPin => ({
		id: label, x, y, label, lore_entry_id: null, visible: true, category: 'other'
	});

	it('files pins under the ward they sit in, smallest ward first, sorted by name', () => {
		const pins = [at('Zed Bar', 300, 300), at('Alpha Shop', 400, 50), at('Tiny Clinic', 150, 150)];
		const result = placesInDistrict(district, all, pins);
		expect(result.wards.map((w) => [w.ward.id, w.places.map((p) => p.label)])).toEqual([
			['big', ['Alpha Shop', 'Zed Bar']],
			['small', ['Tiny Clinic']]
		]);
	});

	it('lists pins outside every ward as elsewhere, and ignores pins in other districts', () => {
		const result = placesInDistrict(district, all, [at('Dock', 900, 900), at('Far', 5000, 5000)]);
		expect(result.elsewhere.map((p) => p.label)).toEqual(['Dock']);
		expect(result.wards.every((w) => w.places.length === 0)).toBe(true);
	});

	it('finds the district for a ward', () => {
		expect(districtOf(smallWard, all)).toBe(district);
		expect(districtOf(district, all)).toBe(district);
	});
});
