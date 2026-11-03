# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@1.1.1 create --template minimal --types ts --install npm cyberdeck
```

## Adding features

Add features to your project with `sv add`:

```sh
npx sv add
```

For example, to add Tailwind CSS:

```sh
npx sv add tailwindcss
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Local rulebook reader

The RULES tab accepts your own PDF (up to 250 MB). Its bytes, page text and search
index are stored only in the browser's `cybrdek-rulebook` IndexedDB database,
separately from character backups. Removing the book deletes that record. Clearing
site data also removes it. There is no upload endpoint or shared copy.

PDF.js receives local bytes and uses a bundled worker, fonts, CMaps and image
decoders. The service worker precaches these assets for offline reading. Search
uses whole words (all query words must occur on a page), ignoring case and accents.
Page numbers refer to PDF pages, including covers. Image-only scans can be read,
but OCR and password-protected files are not supported.

Run the synthetic-PDF offline browser check against a production build:

```sh
npx playwright install chromium
npm run test:rulebook
```

CI runs this check after type-checking, unit tests and building. The test generates
an invented PDF in memory; never substitute a real rulebook. For a locally
installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path.

## City map

Open `/map` for Voyage City's district map. Drag/pinch or use the wheel and buttons
to navigate; the district list also supports keyboard selection. The overview
works offline, with detail cached after zooming. Names and geometry are data in
`src/lib/map/districts.ts`; integration hooks and asset details are documented in
`src/lib/map/README.md`. GM pins and lore wiring are a separate follow-up.
