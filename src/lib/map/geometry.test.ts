import { describe, expect, it } from 'vitest';
import { DISTRICTS, MAP_HEIGHT, MAP_WIDTH } from './districts.ts';
import { containsPoint, constrain, districtAt, fitMap, fitScale, focusDistrict, mapPoint, MAX_ZOOM, polygonArea, resizeView, zoomAt } from './geometry.ts';

const phone = { width: 358, height: 480 };

describe('district traces', () => {
	it('keeps unique editable names/slugs, valid source-image coordinates, and labels inside shapes', () => {
		expect(new Set(DISTRICTS.map((d) => d.id)).size).toBe(DISTRICTS.length);
		for (const d of DISTRICTS) {
			expect(d.loreSlug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(polygonArea(d.polygon)).toBeGreaterThan(1000);
			for (const [x, y] of d.polygon) {
				expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(MAP_WIDTH);
				expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(MAP_HEIGHT);
			}
			expect(containsPoint(d.polygon, d.label), d.name).toBe(true);
		}
	});
	it('finds the named district at every label, including nested neighbourhoods', () => {
		for (const d of DISTRICTS) expect(districtAt(DISTRICTS, d.label)?.id, d.name).toBe(d.id);
		expect(districtAt(DISTRICTS, [50, 50])).toBeUndefined();
	});
	it('includes polygon edges but not the ocean', () => {
		const polygon = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
		expect(containsPoint(polygon, [10, 5])).toBe(true);
		expect(containsPoint(polygon, [11, 5])).toBe(false);
	});
});

describe('map navigation', () => {
	it('fits the whole image and centers the short axis', () => {
		const view = fitMap(phone);
		expect(view.x).toBe(0);
		expect(view.y).toBeCloseTo((phone.height - MAP_HEIGHT * view.scale) / 2);
		expect(view.scale).toBeCloseTo(phone.width / MAP_WIDTH);
	});
	it('zooms about the pointer without moving the underlying map coordinate', () => {
		const view = constrain({ scale: fitScale(phone) * 3, x: -300, y: -100 }, phone);
		const anchor = [150, 200] as const;
		const before = mapPoint(anchor, view);
		const next = zoomAt(view, anchor, 1.5, phone);
		expect(mapPoint(anchor, next)[0]).toBeCloseTo(before[0]);
		expect(mapPoint(anchor, next)[1]).toBeCloseTo(before[1]);
	});
	it('combines pinch centroid translation and scale', () => {
		const view = constrain({ scale: fitScale(phone) * 3, x: -300, y: -100 }, phone);
		const point = mapPoint([150, 200], view);
		const next = zoomAt(view, [150, 200], 1.2, phone, [180, 220]);
		expect(mapPoint([180, 220], next)[0]).toBeCloseTo(point[0]);
		expect(mapPoint([180, 220], next)[1]).toBeCloseTo(point[1]);
	});
	it('clamps zoom and pan rather than losing the map offscreen', () => {
		const next = constrain({ x: 9999, y: -9999, scale: 9999 }, phone);
		expect(next.scale).toBeCloseTo(fitScale(phone) * MAX_ZOOM);
		expect(next.x).toBe(0);
		expect(next.y).toBeCloseTo(phone.height - MAP_HEIGHT * next.scale);
		expect(zoomAt(next, [100, 100], 0.00001, phone)).toEqual(fitMap(phone));
	});
	it('focuses a chosen district and preserves relative zoom when the viewport resizes', () => {
		const focused = focusDistrict(DISTRICTS[0], phone);
		expect(focused.scale).toBeGreaterThan(fitScale(phone));
		const after = { width: 800, height: 600 };
		const resized = resizeView(focused, phone, after);
		expect(resized.scale / fitScale(after)).toBeCloseTo(focused.scale / fitScale(phone));
	});
});
