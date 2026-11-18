// A campaign's own maps (MP-3, #62). The GM's image is shrunk in the browser to
// two copies, a detailed one for zooming and a small one for phones, then
// stored privately; row-level security decides who may read or change them.
import { supabase } from '#lib/supabase/client.ts';
import { MAP_CACHE } from '#lib/storage/cache-names.ts';
import type { MapDefinition } from './types.ts';

export const BUCKET = 'campaign-maps';
export const MAX_MAPS = 10;
export const FULL_EDGE = 4096; // longest side of the detailed copy
export const SMALL_EDGE = 1600; // longest side of the copy phones load first
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // the bucket's limit
export const MAX_SOURCE_BYTES = 60 * 1024 * 1024; // what we'll try to open at all
const TIMEOUT_MS = 30000;

export interface CampaignMap {
	id: string;
	name: string;
	width: number;
	height: number;
	active: boolean;
	uploaded_by?: string | null; // null for the GM's older maps
}

export const imagePath = (campaignId: string, mapId: string, size: 'full' | 'small') => `${campaignId}/${mapId}/${size}`;

/** The size to draw at so the longest side is at most `edge`, never upscaling. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
	const scale = Math.min(1, edge / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function validMapName(name: string): string | null {
	const trimmed = name.trim();
	if (!trimmed) return 'Give the map a name.';
	if (trimmed.length > 80) return 'Keep the name to 80 characters.';
	return null;
}

// ---- in the browser

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** WebP where the browser can make it; Safari can't, so JPEG there. Under the bucket's limit. */
async function encode(source: ImageBitmap, size: { width: number; height: number }): Promise<Blob> {
	let { width, height } = size;
	for (let attempt = 0; attempt < 4; attempt++) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('This browser cannot resize images.');
		context.imageSmoothingQuality = 'high';
		context.drawImage(source, 0, 0, width, height);
		let blob = await canvasBlob(canvas, 'image/webp', 0.85);
		if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', 0.85);
		if (!blob || (blob.type !== 'image/webp' && blob.type !== 'image/jpeg')) throw new Error('This browser cannot save the image.');
		if (blob.size <= MAX_FILE_BYTES) return blob;
		width = Math.round(width * 0.75);
		height = Math.round(height * 0.75);
	}
	throw new Error('That image is too detailed to store. Try a smaller one.');
}

export interface PreparedMap {
	full: Blob;
	small: Blob;
	width: number; // the full copy's size: pins use these coordinates
	height: number;
}

export async function prepareImage(file: File): Promise<PreparedMap> {
	if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG or WebP).');
	if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is over 60 MB. Choose a smaller one.');
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new Error("That image couldn't be opened. Try a JPEG, PNG or WebP.");
	}
	try {
		if (bitmap.width < 16 || bitmap.height < 16) throw new Error('That image is too small to use as a map.');
		const full = await encode(bitmap, fitWithin(bitmap.width, bitmap.height, FULL_EDGE));
		// The stored size is what was actually encoded, after any shrinking for the limit.
		const fullBitmap = await createImageBitmap(full);
		const width = fullBitmap.width;
		const height = fullBitmap.height;
		fullBitmap.close();
		const small = await encode(bitmap, fitWithin(width, height, SMALL_EDGE));
		return { full, small, width, height };
	} finally {
		bitmap.close();
	}
}

// ---- Supabase

export async function listMaps(campaignId: string): Promise<CampaignMap[] | { error: string }> {
	const { data, error } = await supabase()
		.from('campaign_maps')
		.select('id, name, width, height, active, uploaded_by')
		.eq('campaign_id', campaignId)
		.order('created_at')
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
	if (error || !data) return { error: 'Maps need a connection.' };
	return data as CampaignMap[];
}

/** Add a map: its row first (the storage rules need it), then both images. All or nothing. */
export async function uploadMap(campaignId: string, name: string, prepared: PreparedMap): Promise<CampaignMap | { error: string }> {
	const problem = validMapName(name);
	if (problem) return { error: problem };
	const { data, error } = await supabase()
		.from('campaign_maps')
		.insert({ campaign_id: campaignId, name: name.trim(), width: prepared.width, height: prepared.height })
		.select('id, name, width, height, active, uploaded_by')
		.single();
	if (error || !data) return { error: error?.code === '23514' ? 'A campaign can have up to 10 maps. Delete one first.' : 'The map could not be saved.' };
	const map = data as CampaignMap;
	const storage = supabase().storage.from(BUCKET);
	for (const size of ['full', 'small'] as const) {
		const blob = prepared[size];
		const { error: uploadError } = await storage.upload(imagePath(campaignId, map.id, size), blob, { contentType: blob.type, upsert: true });
		if (uploadError) {
			const cleanup = await removeMap(campaignId, map.id);
			return {
				error: cleanup
					? `The image could not be uploaded, and the half-made map "${map.name}" is still listed. Delete it, then try again.`
					: 'The image could not be uploaded. Check your connection and try again.'
			};
		}
	}
	return map;
}

/**
 * Images first: once the row is gone the storage rules no longer let anyone
 * remove them. So if removing them fails, the map stays, to try again later.
 */
export async function removeMap(campaignId: string, mapId: string): Promise<string | null> {
	const { error: filesError } = await supabase()
		.storage.from(BUCKET)
		.remove([imagePath(campaignId, mapId, 'full'), imagePath(campaignId, mapId, 'small')]);
	if (filesError) return "The map's images could not be removed, so the map was kept. Try again.";
	const { error } = await supabase().from('campaign_maps').delete().eq('id', mapId);
	if (error) return 'The map could not be deleted.';
	await forgetCachedImages(mapId);
	return null;
}

export async function renameMap(mapId: string, name: string): Promise<string | null> {
	const problem = validMapName(name);
	if (problem) return problem;
	const { error } = await supabase().from('campaign_maps').update({ name: name.trim() }).eq('id', mapId);
	return error ? 'The map could not be renamed.' : null;
}

export async function setActiveMap(campaignId: string, mapId: string | null): Promise<string | null> {
	const { error } = await supabase().rpc('set_active_map', { campaign: campaignId, map: mapId });
	return error ? 'The active map could not be changed.' : null;
}

/** Whether this account may add maps to the campaign: its GM, or a player when the GM allows it. */
export async function canUploadMap(campaignId: string): Promise<boolean> {
	const { data, error } = await supabase().rpc('can_upload_map', { campaign: campaignId });
	return !error && data === true;
}

/** The GM's setting: may players upload maps? null when it can't be read. */
export async function playersUploadMaps(campaignId: string): Promise<boolean | null> {
	const { data, error } = await supabase().from('campaigns').select('players_upload_maps').eq('id', campaignId).single();
	return error || !data ? null : (data as { players_upload_maps: boolean }).players_upload_maps;
}

export async function setPlayersUploadMaps(campaignId: string, allowed: boolean): Promise<string | null> {
	const { error } = await supabase().from('campaigns').update({ players_upload_maps: allowed }).eq('id', campaignId);
	return error ? 'The setting could not be saved.' : null;
}

// ---- images, kept on the device so the active map works offline

// Kept per account, like private lore (lore/api.ts), and wiped on sign-out, so
// the next person on this device never sees a private campaign's map.
const CACHE = MAP_CACHE; // the service worker keeps it across app updates
export const ACTIVE_MAP_PREFIX = 'cybrdek:active-map:';
let viewer = 'signed-out';
/** Who is looking: the signed-in account's id, or null when signed out. */
export function setMapViewer(userId: string | null) {
	viewer = userId ?? 'signed-out';
}
const cacheKey = (mapId: string, size: 'full' | 'small') => `/__campaign-maps/${viewer}/${mapId}/${size}`;
export const activeMapKey = (campaignId: string) => `${ACTIVE_MAP_PREFIX}${viewer}:${campaignId}`;

/** Sign-out: forget every map image and remembered map on this device. */
export async function clearMapCaches(): Promise<void> {
	try {
		const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
		for (const key of keys) if (key?.startsWith(ACTIVE_MAP_PREFIX)) localStorage.removeItem(key);
	} catch {
		// storage blocked: nothing was saved there either
	}
	if (typeof caches !== 'undefined') await caches.delete(CACHE).catch(() => false);
}

async function cachedImage(campaignId: string, mapId: string, size: 'full' | 'small', network: boolean): Promise<Blob | null> {
	const cache = typeof caches === 'undefined' ? undefined : await caches.open(CACHE).catch(() => undefined);
	const { data } = network ? await supabase().storage.from(BUCKET).download(imagePath(campaignId, mapId, size)) : { data: null };
	if (data) {
		await cache?.put(cacheKey(mapId, size), new Response(data, { headers: { 'Content-Type': data.type } })).catch(() => {});
		return data;
	}
	const saved = await cache?.match(cacheKey(mapId, size));
	return saved ? saved.blob() : null;
}

async function forgetCachedImages(mapId: string) {
	if (typeof caches === 'undefined') return;
	const cache = await caches.open(CACHE).catch(() => undefined);
	await Promise.all((['full', 'small'] as const).map((size) => cache?.delete(cacheKey(mapId, size))));
}

/**
 * The map ready for CityMap, with object URLs for its images. Call `release`
 * when done with it. Null if neither image can be had. With `network: false`
 * only this device's copy is used, which is instant and works offline.
 */
export async function loadMapDefinition(
	campaignId: string,
	map: CampaignMap,
	network = true
): Promise<{ definition: MapDefinition; release: () => void } | null> {
	const [small, full] = await Promise.all([
		cachedImage(campaignId, map.id, 'small', network),
		cachedImage(campaignId, map.id, 'full', network)
	]);
	if (!small && !full) return null;
	const urls = [small, full].map((blob) => (blob ? URL.createObjectURL(blob) : undefined));
	return {
		definition: {
			name: map.name,
			alt: map.name,
			width: map.width,
			height: map.height,
			imageUrl: (urls[0] ?? urls[1])!,
			detailImageUrl: urls[1]
		},
		release: () => urls.forEach((url) => url && URL.revokeObjectURL(url))
	};
}
