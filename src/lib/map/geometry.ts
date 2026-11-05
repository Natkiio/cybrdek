import type { MapArea as District, Point, Size } from './types.ts';
export type { Size } from './types.ts';

export interface Transform { x: number; y: number; scale: number }
export const MAX_ZOOM = 12;

export function polygonArea(points: readonly Point[]): number {
	return Math.abs(points.reduce((sum, [x, y], i) => {
		const [nx, ny] = points[(i + 1) % points.length];
		return sum + x * ny - nx * y;
	}, 0)) / 2;
}

/** Ray casting; points on an edge are included. */
export function containsPoint(polygon: readonly Point[], [x, y]: Point): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
		const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
		if (Math.abs(cross) < 0.001 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
		if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

export function districtAt(districts: readonly District[], point: Point): District | undefined {
	return districts.filter((d) => containsPoint(d.polygon, point))
		.sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon))[0];
}

export const fitScale = ({ width, height }: Size, map: Size) => Math.min(width / map.width, height / map.height);
export const mapPoint = (point: Point, view: Transform): Point => [(point[0] - view.x) / view.scale, (point[1] - view.y) / view.scale];

/** Keep the map inside the viewport; center any axis smaller than the viewport. */
export function constrain(view: Transform, size: Size, map: Size): Transform {
	const min = fitScale(size, map);
	const scale = Math.max(min, Math.min(min * MAX_ZOOM, view.scale));
	const width = map.width * scale, height = map.height * scale;
	return { scale,
		x: width <= size.width ? (size.width - width) / 2 : Math.max(size.width - width, Math.min(0, view.x)),
		y: height <= size.height ? (size.height - height) / 2 : Math.max(size.height - height, Math.min(0, view.y)) };
}

export const fitMap = (size: Size, map: Size): Transform => constrain({ x: 0, y: 0, scale: fitScale(size, map) }, size, map);

/** Anchor a map coordinate under a screen point; used by pinch, wheel and buttons. */
export function zoomAt(view: Transform, anchor: Point, factor: number, size: Size, map: Size, nextAnchor = anchor): Transform {
	const point = mapPoint(anchor, view);
	const scale = Math.max(fitScale(size, map), Math.min(fitScale(size, map) * MAX_ZOOM, view.scale * factor));
	return constrain({ scale, x: nextAnchor[0] - point[0] * scale, y: nextAnchor[1] - point[1] * scale }, size, map);
}

export function focusDistrict(district: District, size: Size, map: Size): Transform {
	const xs = district.polygon.map(([x]) => x), ys = district.polygon.map(([, y]) => y);
	const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
	const scale = Math.min(size.width * 0.8 / (right - left), size.height * 0.7 / (bottom - top), fitScale(size, map) * MAX_ZOOM);
	return constrain({ scale, x: size.width / 2 - (left + right) / 2 * scale, y: size.height / 2 - (top + bottom) / 2 * scale }, size, map);
}

export function resizeView(view: Transform, before: Size, after: Size, map: Size): Transform {
	const center = mapPoint([before.width / 2, before.height / 2], view);
	const scale = view.scale / fitScale(before, map) * fitScale(after, map);
	return constrain({ scale, x: after.width / 2 - center[0] * scale, y: after.height / 2 - center[1] * scale }, after, map);
}
