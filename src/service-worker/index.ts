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
// Character pages (/characters/<id>) render entirely in the browser (ssr = false),
// so one cached copy of that page works for every character.
// =============================================================================

import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

const CACHE = `cybrdek-${version}`;

/** Pages to cache up front, so the app opens offline even on a fresh install. */
const PAGES = ['/', '/characters', '/characters/new', '/rules'];
/** Any /characters/<id> page offline is served from this one cached copy. */
const CHARACTER_SHELL = '/characters/_offline';

const APP_FILES = [...immutable, ...assets].map((file) => file.path);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll([...APP_FILES, ...PAGES, CHARACTER_SHELL]);
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
			const fallback = url.pathname.startsWith('/characters/')
				? await cache.match(CHARACTER_SHELL)
				: await cache.match('/');
			if (fallback) return fallback;
		}
		throw error;
	}
}
