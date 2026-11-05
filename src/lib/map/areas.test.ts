import { describe, expect, it } from 'vitest';
import { DISTRICTS, VOYAGE_MAP } from './districts.ts';
import { areaLabel, movePoint, removeArea, replaceArea, selfIntersects, validateAreas, validatePolygon } from './areas.ts';
import { containsPoint, constrain, fitMap, fitScale, mapPoint, resizeView, zoomAt } from './geometry.ts';
import { clampToMap, placesInDistrict, validatePin, type MapPin } from './pins.ts';
import type { MapArea, Point } from './types.ts';

const map = { width: 300, height: 700 };
const square: readonly Point[] = [[10, 10], [200, 10], [200, 400], [10, 400]];
const area = (id = 'district', kind: 'district' | 'ward' = 'district', parentId?: string): MapArea =>
	({ id, name: id, polygon: square, label: [100, 100], kind, parentId });

describe('area validation', () => {
	it('validates all 13 Voyage areas through the generic format', () => {
		expect(DISTRICTS).toHaveLength(13);
		for (const district of DISTRICTS) expect(validatePolygon(district.polygon, VOYAGE_MAP), district.name).toEqual([]);
		expect(validateAreas(DISTRICTS, VOYAGE_MAP)).toEqual([]);
	});
	it.each([[], [[1, 1]], [[1, 1], [2, 2]]].map((points) => ({ points })))('needs at least three points: $points', ({ points }) => {
		expect(validatePolygon(points, map)).toEqual(['Draw at least 3 points.']);
	});
	it.each([
		[[0, 0], [301, 0], [0, 10]],
		[[0, 0], [0, 701], [10, 0]],
		[[-1, 0], [20, 0], [0, 20]],
		[[NaN, 0], [20, 0], [0, 20]],
		[[Infinity, 0], [20, 0], [0, 20]],
		[[0, 0], [1, 1], [2, 2]],
		[[0, 0], [20, 0], [20, 20], [0, 0]],
		[[0, 0], [20, 20], [0, 20], [20, 0]],
		[[0, 0], [20, 0], [10, 0], [20, 20], [0, 20]],
		[null, [20, 0], [0, 20]]
	].map((points) => ({ points })))('rejects outside, non-finite, repeated or invalid outlines: $points', ({ points }) => {
		expect(validatePolygon(points, map).length).toBeGreaterThan(0);
	});
	it('accepts map edges, concave polygons and either winding direction', () => {
		const points: Point[] = [[0, 0], [300, 0], [300, 700], [150, 500], [0, 700]];
		expect(validatePolygon(points, map)).toEqual([]);
		expect(validatePolygon([...points].reverse(), map)).toEqual([]);
		expect(selfIntersects(points)).toBe(false);
		expect(containsPoint(points, areaLabel(points))).toBe(true);
	});
	it('has a label fallback for a concave polygon whose average lies outside', () => {
		const points: Point[] = [[0, 0], [100, 0], [100, 20], [20, 20], [20, 100], [0, 100]];
		expect(containsPoint(points, areaLabel(points))).toBe(true);
	});
	it('checks IDs, names, kind, parent districts and labels', () => {
		const district = area(), ward = area('ward', 'ward', district.id);
		expect(validateAreas([district, ward], map)).toEqual([]);
		for (const invalid of [null, [null], [district, district], [{ ...district, name: ' ' }],
			[{ ...district, kind: 'city' }], [{ ...ward, parentId: 'missing' }],
			[{ ...ward, parentId: 'ward' }], [{ ...district, parentId: 'district' }],
			[{ ...district, label: [300, 700] }]]) expect(validateAreas(invalid, map).length).toBeGreaterThan(0);
		expect(validateAreas([], { width: 0, height: 700 }).length).toBeGreaterThan(0);
	});
});

describe('editing immutable geometry', () => {
	it('moves and clamps only the chosen point for this map size', () => {
		expect(movePoint(square, 1, [1000, -10], map)).toEqual([[10, 10], [300, 0], [200, 400], [10, 400]]);
		expect(square[1]).toEqual([200, 10]);
		expect(movePoint(square, -1, [0, 0], map)).toEqual(square);
	});
	it('adds, renames and changes ward membership without changing IDs', () => {
		const district = area(), other = area('other'), ward = area('ward', 'ward', district.id);
		const result = replaceArea([district, other, ward], { ...ward, name: 'Renamed', parentId: other.id }, map);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.areas[2]).toMatchObject({ id: 'ward', name: 'Renamed', parentId: 'other' });
		expect(ward.parentId).toBe('district');
		expect(replaceArea([], district, map)).toEqual({ ok: true, areas: [district] });
	});
	it('refuses invalid edits and orphaned wards; allows removal after reassignment', () => {
		const district = area(), ward = area('ward', 'ward', district.id);
		expect(replaceArea([district, ward], { ...district, kind: 'ward', parentId: 'ward' }, map).ok).toBe(false);
		expect(replaceArea([district], { ...district, polygon: [] }, map).ok).toBe(false);
		expect(removeArea([district, ward], district.id).ok).toBe(false);
		expect(removeArea([district, ward], ward.id)).toEqual({ ok: true, areas: [district] });
		expect(removeArea([district], district.id)).toEqual({ ok: true, areas: [] });
	});
});

describe('different image sizes', () => {
	const viewport = { width: 390, height: 450 };
	it('fits a portrait image, anchors zoom and preserves relative zoom on resize', () => {
		const fitted = fitMap(viewport, map);
		expect(fitted.scale).toBeCloseTo(450 / 700);
		expect(fitted.x).toBeCloseTo((390 - 300 * fitted.scale) / 2);
		const zoomed = zoomAt(fitted, [195, 225], 2, viewport, map);
		expect(mapPoint([195, 225], zoomed)).toEqual(mapPoint([195, 225], fitted));
		const resized = resizeView(zoomed, viewport, { width: 700, height: 400 }, map);
		expect(resized.scale / fitScale({ width: 700, height: 400 }, map)).toBeCloseTo(2);
		expect(constrain({ ...zoomed, x: 99999, y: -99999 }, viewport, map).y).toBeCloseTo(450 - map.height * zoomed.scale);
	});
	it('clamps and validates pins using the supplied dimensions, including non-finite values', () => {
		expect(clampToMap(1000, 1000, map)).toEqual({ x: 300, y: 700 });
		const pin = { x: 300, y: 700, label: 'Place', visible: true, category: 'other', lore_entry_id: null } as const;
		expect(validatePin(pin, map)).toEqual([]);
		for (const next of [{ ...pin, x: 301 }, { ...pin, y: Infinity }, { ...pin, x: NaN }]) expect(validatePin(next, map)).toHaveLength(1);
	});
	it('keeps district → ward → places grouping for custom geometry', () => {
		const district = area();
		const ward = { ...area('ward', 'ward', district.id), polygon: [[20, 20], [40, 20], [40, 40], [20, 40]] as Point[], label: [30, 30] as Point };
		const pin: MapPin = { id: 'pin', x: 30, y: 30, label: 'Workshop', visible: true, category: 'shop', lore_entry_id: null };
		expect(placesInDistrict(district, [district, ward], [pin]).wards[0].places).toEqual([pin]);
	});
});
