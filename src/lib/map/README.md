# Voyage City map

`districts.ts` is the geometry/name source. Coordinates always refer to Nathan's
3840 × 2160 original `~/Documents/The_City_of_Voyage.jpg`, even though the two WebP
copies have different resolutions. IDs are stable lowercase hyphenated slugs;
`name` and `loreSlug` are separate fields intended for later GM overrides.

Thick white divisions and coastlines were traced by hand. Smaller labelled areas
without an enclosing border use approximate street edges (`boundary: 'inferred'`).
Brookhaven is inferred around its named street. Newpine and Amber Hill are included
alongside the thirteen requested names. Smaller overlapping polygons win taps,
so a neighbourhood inside a larger district can be selected independently.

`CityMap.svelte` accepts a replacement `districts` array, `onselect`, and a
`districtInfo(district)` callback returning `{summary?, href?}`. The caller must
resolve lore access before returning info; the standalone route does not fetch
lore or create links to unwritten entries. The optional `overlay` SVG snippet uses
original image coordinates. Future pin controls can use `data-map-interactive` to
receive pointer input without starting map pan gestures.

Assets were converted with Pillow/WebP method 6:

- `static/maps/voyage-overview.webp`: 1920 × 1080, quality 72, 479,714 bytes.
- `static/maps/voyage-detail.webp`: 3072 × 1728, quality 72, 948,592 bytes.

The overview and `/map` are precached. Detail is requested for larger viewports or
zoom and cached on first use. If it has never been downloaded, offline zoom falls
back to the overview. This keeps initial mobile map cost below 0.5 MB. These files
are Nathan's own artwork; no rulebook content is included.

Navigation math is tested independently of the browser. The Playwright map tests
exercise taps, drag, keyboard/wheel/buttons, real two-contact touch events,
resizing and both offline image paths. Run after a production build with
`npx playwright test tests/e2e/map.pw.ts`.
