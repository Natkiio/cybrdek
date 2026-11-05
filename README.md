# Cybrdek

**An offline-first Cyberpunk RED companion app for desktop and mobile, used by 20+ users.**

Cybrdek brings character sheets, dice rolls, searchable rulebooks and campaign information into one terminal-styled interface. It runs in the browser or as an installed progressive web app (PWA), so players can keep their character and rules available at the table, even without an internet connection.

[Open the app](https://cybrdek.vercel.app) · [Report an issue](https://github.com/Natkiio/cybrdek/issues) · [Project portfolio](https://natkiio-cybr-cv.vercel.app/)

The app is actively developed. Character data is stored on each device; shared campaign content uses Supabase.

## Features

- **Character management:** create and manage Cyberpunk RED characters, track skills and derived stats, manage gear and armour, apply damage and spend Improvement Points.
- **Dice and skill checks:** roll dice and resolve system-specific checks, with a roll history available in the interface.
- **Portable character backups:** export and import versioned JSON files, with validation before imported data reaches local storage.
- **Local rulebook reader:** open your own PDF, search its text and read it offline. The file stays in your browser rather than being uploaded to a server.
- **Interactive campaign map:** explore Voyage City through districts, wards and places, with pan, zoom, touch and keyboard controls, map pins and links to campaign lore.
- **Campaign wiki and GM tools:** browse linked lore entries; authorised Game Masters can manage campaign content and its visibility. Previously cached player-visible lore remains available offline.
- **Installable interface:** a mobile-first layout with a terminal/CRT aesthetic, self-hosted fonts and a service worker for offline access.

## Technical approach

### Local data and offline access

Character records live in IndexedDB through Dexie. A service worker caches app assets and page shells, while rulebook bytes, extracted text and the search index are stored in a separate browser database. Character data and imported PDFs are not automatically synchronised between devices.

PDF.js renders locally supplied PDFs. A word-to-page index supports multi-word searches without a server request. The reader bundles its worker, fonts and supporting assets for offline use.

The map precaches a smaller overview and downloads higher-resolution detail when needed. If that detail has not been cached, offline navigation falls back to the overview. See the [map implementation notes](src/lib/map/README.md).

### Shared content and permissions

Supabase provides PostgreSQL storage and magic-link authentication for shared campaign content. SQL migrations define the schema and row-level security policies: players can read published content, while only authorised GMs can edit it or access hidden entries. Permissions are enforced in the database as well as reflected in the UI.

The campaign wiki caches player-visible entries for offline reading. Signing in or editing shared content requires a connection; the cache is a reading fallback, not an offline editing queue.

### Rules and interface separation

Shared engine types and dice logic are separate from Cyberpunk RED data and rule calculations. A ruleset interface keeps the UI and storage from depending directly on one game's implementation. Cyberpunk RED is the current supported system; additional systems are not yet implemented.

## Stack

| Area | Technologies |
| --- | --- |
| Interface | Svelte 5, SvelteKit, TypeScript, Vite |
| On-device storage | IndexedDB, Dexie |
| Shared backend | Supabase Auth, PostgreSQL, row-level security |
| Documents | PDF.js, local text extraction and search |
| Offline support | Service worker, Cache API, web app manifest |
| Testing | Vitest, Playwright, fake-indexeddb |
| Continuous integration | GitHub Actions: type-checking, tests and production build |

## Run locally

Use **Node.js 24**, matching the version used in CI, and npm.

```bash
git clone https://github.com/Natkiio/cybrdek.git
cd cybrdek
npm ci
npm run dev
```

Open the local URL printed by Vite. Character management and the PDF reader use browser storage and do not require a Supabase sign-in.

### Shared campaign backend

The checked-in public client configuration in [`src/lib/supabase/config.ts`](src/lib/supabase/config.ts) points to the hosted campaign backend. Running the app locally does not grant GM access.

To use your own backend:

1. Create a Supabase project and apply the SQL files in [`supabase/migrations/`](supabase/migrations/) in filename order.
2. Set your project's URL and public anonymous key in `src/lib/supabase/config.ts`.
3. Configure email magic-link authentication and allow your app's `/gm` URL as an authentication redirect.
4. Add authorised GM email addresses, in lowercase, to the `public.gms` table using the database administration tools.

Use only a public client key in the browser configuration. Database passwords and service-role keys do not belong in client code.

## Checks and tests

```bash
npm run check       # Svelte, TypeScript and service-worker checks
npm test            # Vitest unit tests
npm run build       # Production build
```

Run browser tests against a production build:

```bash
npx playwright install chromium
npm run test:rulebook
```

Despite its historical name, `test:rulebook` builds the app and runs the full Playwright suite, including rulebook, map and offline-lore checks. Playwright starts the preview server automatically.

To use an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path. To run just the rulebook browser tests after building:

```bash
npx playwright test tests/e2e/rulebook.pw.ts
```

Unit tests cover rules calculations, dice notation, character import validation, PDF search, lore caching and map geometry. Browser tests exercise offline reading and map interaction. PDF tests generate synthetic documents; they do not use copyrighted rulebooks. [GitHub Actions](.github/workflows/ci.yml) runs type-checking, unit tests, the production build and browser tests on pull requests and pushes to `main`.

## Project structure

```text
src/lib/engine/       Shared types, dice and rules math
src/lib/rulesets/red/ Cyberpunk RED data and rule calculations
src/lib/components/  Shared UI and character-sheet components
src/lib/storage/     IndexedDB persistence and character backups
src/lib/rulebook/    PDF loading, text extraction and search
src/lib/supabase/    Backend client and GM session handling
src/lib/lore/        Campaign content, links, rendering and caching
src/lib/map/         District geometry, navigation and pins
src/routes/          Application pages
src/service-worker/  App caching and offline page handling
supabase/migrations/ Database schema and access policies
tests/e2e/           Playwright browser tests
```

## Data and rulebooks

Character data and PDFs are stored in the current browser. Export character backups before clearing site data or moving to another device. Removing an imported book deletes its local record; clearing site data also removes local characters, imported books and cached content.

The reader accepts PDFs up to 250 MB. Text search needs a text layer: image-only scans can be viewed, but OCR and password-protected PDFs are not supported. Search uses whole words, ignores case and accents, and requires every query word to occur on the same page. Page numbers include covers and other front matter.

No Cyberpunk RED rulebook PDFs or extracted rule text are distributed with this repository. Supply your own legally obtained copy through the local reader. The Voyage City map artwork is original project content.

## Development workflow

Changes go through feature branches and pull requests, with CI required before merging. Feature work and bugs are tracked in [GitHub Issues](https://github.com/Natkiio/cybrdek/issues).

## Licence

The source code is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). If you run a modified version as a service, you must share its source code with its users.

This licence covers the code only. It does not cover:

- the Voyage City map images in `static/maps/`, which remain the property of their author, with all rights reserved;
- material belonging to R. Talsorian Games and its licensees (see below);
- third-party dependencies and fonts, which keep their own licences.

## Unofficial content

Cybrdek is unofficial content provided under the [Homebrew Content Policy](https://rtalsoriangames.com/homebrew-content-policy/) of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials that are the property of R. Talsorian Games and its licensees.
