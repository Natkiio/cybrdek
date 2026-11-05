# Maps and drawn areas

`types.ts` defines `MapDefinition` (`name`, `imageUrl`, optional `detailImageUrl`
and `alt`, `width`, `height`) and `MapArea` (`id`, `name`, `polygon`, `label`,
`kind`, optional `parentId`, `loreSlug`, `boundary`). Coordinates use the logical
image size, even when overview/detail images have different resolutions.

```svelte
<CityMap {map} {areas} onselect={selectArea} />
<AreaEditor {map} {areas} onchange={(next) => areas = next} />
```

`CityMap` has no Voyage defaults or constants. It resets fit, selection and image
fallback when the map's image or dimensions change, and preserves relative zoom
on viewport resize. `districtInfo(area)` remains the optional lore callback;
`ontap(point)` can consume a tap before area selection. `overlay(scale)` renders
SVG in image coordinates. Pins use `data-map-interactive`. Draggable overlay
handles use `data-map-handle="id"` plus `data-map-interactive` and receive
`onpointdrag(id, point, phase)` (`start`, `move`, `end`, `cancel`). The editor uses
that hook; normal pan/pinch controls work in Pan mode. `outlines` shows all area
borders and `selectionPopup={false}` hides the viewer popup while editing.

`AreaEditor` stages changes locally. Draw by tapping vertices; move them by drag,
by selecting a numbered point and tapping its destination, or by entering X/Y.
SAVE AREA emits a complete validated `MapArea[]` through `onchange(areas)`;
cancel and invalid drafts emit nothing. IDs survive renaming and membership
changes. Removing/demoting a district is refused until its wards are reassigned
or removed. Vertex coordinates are clamped on movement. Validation rejects
non-finite/outside coordinates, fewer than three points, repeated vertices,
zero-area/self-crossing outlines, duplicate IDs, invalid labels and orphan wards.
It does not require wards to fit geometrically inside their parent: Voyage's
inferred wards can overlap traced district boundaries.

Try `/map/areas`: a client-only sandbox with a practice floorplan, all 13 Voyage
areas and a local-image picker. Images use browser object URLs, never uploads;
all edits disappear on reload or when choosing another map. There is no storage,
authentication, database or nav change. Campaign persistence belongs to its caller.

Pin helpers now require dimensions: `clampToMap(x, y, mapSize)`,
`validatePin(draft, mapSize)`, `savePin(draft, idOrUndefined, mapSize)`.
Navigation helpers similarly receive map size explicitly; `placesInDistrict`
still groups places by `kind`/`parentId` and polygon containment.

## Voyage City source

`districts.ts` is the geometry/name source. Coordinates always refer to Nathan's
3840 × 2160 original `~/Documents/The_City_of_Voyage.jpg`, even though the two WebP
copies have different resolutions. IDs are stable lowercase hyphenated slugs;
`name` and `loreSlug` are separate fields intended for later GM overrides.

Thick white divisions and coastlines were traced by hand. Smaller labelled areas
without an enclosing border use approximate street edges (`boundary: 'inferred'`).
District names were confirmed by Nathan (Corp Sector, Eagelton, Newpine, Amber
Hill); Brookhaven and Arcadia are neighbourhood labels, not districts, so they
are not traced. Smaller overlapping polygons win taps,
so a neighbourhood inside a larger district can be selected independently.

`districts.ts` exports `VOYAGE_MAP` and the 13 `DISTRICTS` using the generic
format. `District` and `Point` are compatibility type exports. The `/map` caller
passes `map={VOYAGE_MAP}` and `areas={districts}`, with existing lore/pin resolution
unchanged. A repeated closing vertex in the traced source is removed because
SVG closes the ring automatically; the visible shape is unchanged.

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
`npx playwright test tests/e2e/map.pw.ts tests/e2e/map-areas.pw.ts`.
