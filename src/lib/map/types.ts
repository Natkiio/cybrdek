/** Image coordinates always use the map's logical size, regardless of image resolution. */
export type Point = readonly [x: number, y: number];
export interface Size { width: number; height: number }

export interface MapDefinition extends Size {
	name: string;
	imageUrl: string;
	/** Optional larger image of exactly the same map, used after zooming. */
	detailImageUrl?: string;
	alt?: string;
}

export interface MapArea {
	id: string;
	name: string;
	polygon: readonly Point[];
	label: Point;
	kind: 'district' | 'ward';
	parentId?: string;
	loreSlug?: string;
	boundary?: 'marked' | 'inferred' | 'drawn';
}

export function validSize(size: Size): boolean {
	return Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0;
}

export function pointOnMap(point: Point, size: Size): boolean {
	return validSize(size) && point.length === 2 && point.every(Number.isFinite) &&
		point[0] >= 0 && point[0] <= size.width && point[1] >= 0 && point[1] <= size.height;
}

export function clampPoint([x, y]: Point, size: Size): Point {
	const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));
	return validSize(size) ? [clamp(x, size.width), clamp(y, size.height)] : [0, 0];
}
