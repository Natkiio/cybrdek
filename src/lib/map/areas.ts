import { containsPoint, polygonArea } from './geometry.ts';
import { clampPoint, pointOnMap, validSize, type MapArea, type Point, type Size } from './types.ts';

export const AREA_NAME_MAX = 80;
const point = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const between = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) < 1e-8 &&
	p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);

/** A simple ring cannot cross or touch a non-neighbouring edge. */
export function selfIntersects(points: readonly Point[]): boolean {
	for (let i = 0; i < points.length; i++) {
		const a = points[i], b = points[(i + 1) % points.length];
		for (let j = i + 2; j < points.length; j++) {
			if (i === 0 && j === points.length - 1) continue;
			const c = points[j], d = points[(j + 1) % points.length];
			if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
				between(a, b, c) || between(a, b, d) || between(c, d, a) || between(c, d, b)) return true;
		}
	}
	return false;
}

export function validatePolygon(value: unknown, map: Size): string[] {
	if (!validSize(map)) return ['The map needs a positive width and height.'];
	if (!Array.isArray(value) || value.length < 3) return ['Draw at least 3 points.'];
	if (!value.every(point)) return ['Every point needs two finite coordinates.'];
	if (!value.every((p) => pointOnMap(p, map))) return ['Every point must be inside the map.'];
	if (new Set(value.map((p) => p.join(','))).size !== value.length) return ['Points must be distinct; the shape closes automatically.'];
	if (polygonArea(value) < 1e-8) return ['The points must enclose an area.'];
	if (selfIntersects(value)) return ['The outline must not cross itself.'];
	return [];
}

/** Validate complete area sets at the editor's onchange boundary (and future campaign imports). */
export function validateAreas(value: unknown, map: Size): string[] {
	if (!Array.isArray(value)) return ['Areas must be a list.'];
	if (!validSize(map)) return ['The map needs a positive width and height.'];
	const problems: string[] = [];
	const ids = new Set<string>();
	for (const area of value) {
		if (!area || typeof area !== 'object' || Array.isArray(area)) { problems.push('Each area must be an object.'); continue; }
		if (typeof area.id !== 'string' || !area.id.trim() || ids.has(area.id)) problems.push('Areas need unique, non-empty IDs.');
		ids.add(area.id);
		if (typeof area.name !== 'string' || !area.name.trim() || area.name.trim().length > AREA_NAME_MAX) problems.push(`Give each area a name of 1–${AREA_NAME_MAX} characters.`);
		const shapeProblems = validatePolygon(area.polygon, map);
		problems.push(...shapeProblems);
		if (!point(area.label) || !pointOnMap(area.label, map) || (!shapeProblems.length && !containsPoint(area.polygon, area.label))) problems.push('The label must be inside its area.');
		if (!['district', 'ward'].includes(area.kind)) problems.push('Choose district or ward.');
		if (area.kind === 'ward' && !value.some((d) => d && d.kind === 'district' && d.id === area.parentId)) problems.push('Each ward needs an existing district.');
		if (area.kind === 'district' && area.parentId !== undefined) problems.push('Districts cannot have a parent.');
		if (area.loreSlug !== undefined && typeof area.loreSlug !== 'string') problems.push('A lore slug must be text.');
		if (area.boundary !== undefined && !['marked', 'inferred', 'drawn'].includes(area.boundary)) problems.push('Unknown boundary type.');
	}
	return [...new Set(problems)];
}

/** A useful interior label; for concave shapes the boundary fallback is still inside. */
export function areaLabel(points: readonly Point[]): Point {
	if (!points.length) return [0, 0];
	const center: Point = [points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[1], 0) / points.length];
	return containsPoint(points, center) ? center : points[0];
}

export function movePoint(points: readonly Point[], index: number, next: Point, map: Size): Point[] {
	return points.map((p, i) => i === index ? clampPoint(next, map) : p);
}

export type AreaChange = { ok: true; areas: MapArea[] } | { ok: false; problems: string[] };
export function replaceArea(areas: readonly MapArea[], area: MapArea, map: Size): AreaChange {
	const next = areas.some((a) => a.id === area.id) ? areas.map((a) => a.id === area.id ? area : a) : [...areas, area];
	const problems = validateAreas(next, map);
	return problems.length ? { ok: false, problems } : { ok: true, areas: next };
}

/** A district's wards must be reassigned or removed before deleting their parent. */
export function removeArea(areas: readonly MapArea[], id: string): AreaChange {
	if (areas.some((a) => a.parentId === id)) return { ok: false, problems: ['Reassign or delete this district’s wards first.'] };
	return { ok: true, areas: areas.filter((a) => a.id !== id) };
}
