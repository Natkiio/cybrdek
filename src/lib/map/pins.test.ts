import { describe, expect, it } from 'vitest';
import type { LoreEntry } from '#lib/lore/types.ts';
import { clampToMap, pinLore, resolveDistrict, validatePin, type MapPin } from './pins.ts';

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
	const pin: MapPin = { id: 'p', x: 10, y: 20, label: "Topaz's Bar", lore_entry_id: 'e-topaz', visible: true };

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
