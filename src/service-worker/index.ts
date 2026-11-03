// =============================================================================
// service-worker.ts: makes Cybrdek work offline (issue #13)
// =============================================================================
// SvelteKit builds this file and registers it automatically. It runs in the
// background, separate from the page, and sits between the app and the network.
//
//   App files (JS, CSS, fonts, icons): cached on install, served from the cache.
//   Pages: network first, so you always get the newest version when online.
//          Offline, it serves the cached copy instead.
//
// Character pages (/characters/<id>) and lore pages (/lore/<entry>) render
// entirely in the browser (ssr = false), so one cached copy of each works for
// every character or entry. Lore text itself comes from Supabase (another
// origin, never cached here); the lore pages keep their own on-device copy of
// the entries players can see.
// =============================================================================

import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

const CACHE = `cybrdek-${version}`;

/** Pages to cache up front, so the app opens offline even on a fresh install. */
const PAGES = ['/', '/characters', '/characters/new', '/dice', '/rules', '/lore', '/gm'];
/** Any /characters/<id> page offline is served from this one cached copy. */
const CHARACTER_SHELL = '/characters/_offline';
/** Any /lore/<entry> (or /lore/<entry>/edit) page offline uses this copy. */
const LORE_SHELL = '/lore/_offline';

/** Which cached shell serves an uncached page offline. */
function offlineShell(pathname: string): string {
	if (pathname.startsWith('/characters/')) return CHARACTER_SHELL;
	if (pathname.startsWith('/lore/')) return LORE_SHELL;
	return '/';
}

// Manifest paths can be relative. Normalize them to match request URL pathnames.
// This also precaches PDF.js's emitted worker, fonts, CMaps and image decoders.
const APP_FILES = [...immutable, ...assets].map((file) =>
	new URL(file.path, self.location.origin).pathname
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll([...APP_FILES, ...PAGES, CHARACTER_SHELL, LORE_SHELL]);
			await self.skipWaiting(); // take over without waiting for old tabs to close
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Delete caches from older versions of the app.
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	event.respondWith(respond(request, url));
});

async function respond(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(CACHE);

	// App files never change for a given version: cache first.
	if (APP_FILES.includes(url.pathname)) {
		const cached = await cache.match(url.pathname);
		if (cached) return cached;
	}

	// Everything else: network first, and keep a fresh copy of pages.
	try {
		const response = await fetch(request);
		if (response.ok && request.mode === 'navigate') {
			await cache.put(request, response.clone());
		}
		return response;
	} catch (error) {
		const cached = await cache.match(request, { ignoreSearch: true });
		if (cached) return cached;

		if (request.mode === 'navigate') {
			const fallback = await cache.match(offlineShell(url.pathname));
			if (fallback) return fallback;
		}
		throw error;
	}
}
