<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import MapDrawer from '#lib/components/map/MapDrawer.svelte';
	import MapFinder from '#lib/components/map/MapFinder.svelte';
	import CityMap, { type MapFocus } from '#lib/components/map/CityMap.svelte';
	import DistrictEditor from '#lib/components/map/DistrictEditor.svelte';
	import DistrictMenu from '#lib/components/map/DistrictMenu.svelte';
	import PinEditor from '#lib/components/map/PinEditor.svelte';
	import MapManager from '#lib/components/map/MapManager.svelte';
	import {
		activeMapKey,
		canUploadMap,
		listMaps,
		loadMapDefinition,
		playersUploadMaps,
		type CampaignMap
	} from '#lib/map/campaign-maps.ts';
	import type { MapDefinition } from '#lib/map/types.ts';
	import { listEntries } from '#lib/lore/api.ts';
	import { latestOnly } from '#lib/lore/latest.ts';
	import type { LoreEntry } from '#lib/lore/types.ts';
	import { VOYAGE_MAP, DISTRICTS, type District, type Point } from '#lib/map/districts.ts';
	import {
		deletePin,
		districtOf,
		placesInDistrict,
		listDistrictOverrides,
		listPins,
		pinLore,
		resolveDistrict,
		saveDistrictOverride,
		savePin,
		type DistrictOverride,
		type MapPin,
		type PinDraft
	} from '#lib/map/pins.ts';
	import { campaign, VOYAGE_CITY_ID } from '#lib/campaigns/current.svelte.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	// Voyage City has its built-in map and districts. Any other campaign shows its
	// GM's active uploaded map (#62); its pins belong to that map.
	const isVoyage = $derived(campaign.id === VOYAGE_CITY_ID);
	let maps = $state<CampaignMap[]>([]);
	let uploaded = $state<{ map: CampaignMap; definition: MapDefinition; release: () => void } | null>(null);
	let mapStatus = $state<'loading' | 'ready' | 'offline'>('loading');
	// Who may add maps here, and (for the GM) whether players may (#62).
	let canUpload = $state(false);
	let playersUpload = $state<boolean | null>(null);
	const hasOwnMaps = $derived(!!gm.userId && maps.some((m) => m.uploaded_by === gm.userId));
	const currentMap = $derived(isVoyage ? VOYAGE_MAP : (uploaded?.definition ?? null));
	const currentMapId = $derived(isVoyage ? null : (uploaded?.map.id ?? null));

	let entries = $state<LoreEntry[]>([]);
	let pins = $state<MapPin[]>([]);
	let overrides = $state<DistrictOverride[]>([]);

	let selectedDistrictId = $state<string | undefined>();
	let selectedPinId = $state<string | undefined>();
	// GM editing state: a pin draft being edited, and whether the next tap places/moves it.
	let draft = $state<PinDraft | null>(null);
	let draftId = $state<string | undefined>();
	let tapMode = $state<'none' | 'place' | 'move'>('none');
	let busy = $state(false);
	let error = $state('');
	let drawer = $state<'finder' | 'layers' | 'pin' | 'district' | null>(null);
	let outlines = $state(false);
	let showPins = $state(true);
	let mapFocus = $state<MapFocus | null>(null);
	let headerHeight = $state(0);
	onMount(() => {
		const header = document.querySelector('header.bar');
		if (!header) return;
		const measure = () => headerHeight = header.getBoundingClientRect().height;
		const observer = new ResizeObserver(measure);
		observer.observe(header);
		measure();
		return () => observer.disconnect();
	});

	const visiblePins = $derived(pins.filter(p => gm.isGm || p.visible));

	const overrideFor = (id: string) => overrides.find((o) => o.district_id === id);
	const districts = $derived(
		DISTRICTS.map((d) => ({ ...d, name: resolveDistrict(d, overrideFor(d.id), entries).name }))
	);
	const selectedDistrict = $derived(districts.find((d) => d.id === selectedDistrictId));
	// The menu always shows a whole district; a tapped ward is highlighted in it.
	const menuDistrict = $derived(selectedDistrict ? districtOf(selectedDistrict, districts) : undefined);
	const menuPlaces = $derived(menuDistrict ? placesInDistrict(menuDistrict, districts, visiblePins) : undefined);
	const loreForArea = (area: District) => resolveDistrict(area, overrideFor(area.id), entries).lore;
	const selectedPin = $derived(visiblePins.find((p) => p.id === selectedPinId));
	const selectedPinLore = $derived(selectedPin ? pinLore(selectedPin, entries) : null);
	const shownPins = $derived(showPins ? visiblePins.filter(p => p.id !== draftId) : []);

	// ---- loading: everything again when GM mode changes (RLS decides what we get)
	const latest = latestOnly();
	// The active map, remembered per campaign so it opens offline too.
	function rememberMaps(campaignId: string, list: CampaignMap[]) {
		try {
			localStorage.setItem(activeMapKey(campaignId), JSON.stringify(list.find((m) => m.active) ?? null));
		} catch {
			// storage blocked: the map just needs a connection next time
		}
	}
	function savedActiveMap(campaignId: string): CampaignMap[] {
		try {
			const saved = JSON.parse(localStorage.getItem(activeMapKey(campaignId)) ?? 'null');
			return saved && typeof saved.id === 'string' ? [saved as CampaignMap] : [];
		} catch {
			return [];
		}
	}

	/** A different map is on screen: nothing being edited on the last one carries over. */
	function showMap(next: typeof uploaded) {
		if (next?.map.id !== uploaded?.map.id) {
			closeDraft();
			selectedPinId = undefined;
			selectedDistrictId = undefined;
			mapFocus = null;
			pins = [];
		}
		uploaded?.release();
		uploaded = next;
	}

	async function loadUploadedMap(campaignId: string, current: () => boolean) {
		// Show this device's copy of the last active map at once (and offline),
		// then check the cloud: a changed or removed map replaces it below.
		const remembered = savedActiveMap(campaignId)[0];
		if (remembered && uploaded?.map.id !== remembered.id) {
			const local = await loadMapDefinition(campaignId, remembered, false);
			if (!current()) {
				local?.release();
				return;
			}
			if (local) {
				showMap({ map: remembered, ...local });
				maps = [remembered];
				mapStatus = 'ready';
			}
		}
		const listed = await listMaps(campaignId);
		if (!current()) return;
		const list = 'error' in listed ? savedActiveMap(campaignId) : listed;
		if (!('error' in listed)) rememberMaps(campaignId, listed);
		maps = list;
		const active = list.find((m) => m.active);
		if (uploaded && uploaded.map.id === active?.id && uploaded.map.width === active.width) {
			mapStatus = 'ready';
			uploaded = { ...uploaded, map: active, definition: { ...uploaded.definition, name: active.name, alt: active.name } };
			return;
		}
		const loaded = active ? await loadMapDefinition(campaignId, active) : null;
		if (!current()) {
			loaded?.release();
			return;
		}
		showMap(loaded && active ? { map: active, ...loaded } : null);
		mapStatus = active && !loaded ? 'offline' : 'ready';
	}

	async function load() {
		const current = latest.begin();
		const campaignId = campaign.id;
		if (campaignId !== VOYAGE_CITY_ID) {
			const signedIn = !!gm.userId;
			const [, allowed, setting] = await Promise.all([
				loadUploadedMap(campaignId, current),
				signedIn && !gm.isGm ? canUploadMap(campaignId) : Promise.resolve(false),
				signedIn && gm.isGm ? playersUploadMaps(campaignId) : Promise.resolve(null)
			]);
			if (!current()) return;
			canUpload = allowed;
			playersUpload = setting;
		} else {
			if (uploaded) showMap(null);
			canUpload = false;
			playersUpload = null;
		}
		if (!current()) return;
		const mapId = campaignId === VOYAGE_CITY_ID ? null : (uploaded?.map.id ?? undefined);
		const [lore, pinRows, overrideRows] = await Promise.all([
			listEntries(),
			mapId === undefined ? Promise.resolve([]) : listPins(mapId),
			campaignId === VOYAGE_CITY_ID ? listDistrictOverrides() : Promise.resolve([])
		]);
		if (!current()) return;
		entries = lore.entries;
		pins = pinRows;
		overrides = overrideRows;
		mapStatus = mapStatus === 'loading' ? 'ready' : mapStatus;
	}
	$effect(() => () => uploaded?.release());
	$effect(() => {
		// Dependencies: GM mode, the campaign and the account. Everything else is
		// untracked, so state the loader reads or writes can't re-run this.
		const isGm = gm.isGm;
		void campaign.id;
		void gm.userId;
		// Wait until we know who's signed in: the offline copy of a campaign's
		// map is kept per account, so looking before then finds the wrong one.
		if (!gm.ready) return;
		if (!isGm) {
			untrack(() => {
				// Leaving GM mode: drop GM-only things from screen now.
				entries = entries.filter((e) => e.visible);
				pins = pins.filter((p) => p.visible);
				closeDraft();
				if (drawer === 'district') drawer = null;
			});
		}
		untrack(() => void load());
	});

	$effect(() => {
		void campaign.id;
		void gm.userId;
		if (!gm.ready) return;
		const refresh = () => { if (navigator.onLine) void load(); };
		const visible = () => { if (document.visibilityState === 'visible') refresh(); };
		window.addEventListener('online', refresh);
		document.addEventListener('visibilitychange', visible);
		return () => {
			window.removeEventListener('online', refresh);
			document.removeEventListener('visibilitychange', visible);
		};
	});

	// ---- map interaction
	function tapped(point: Point): boolean {
		if (!gm.isGm || tapMode === 'none') return false;
		if (tapMode === 'place') {
			draft = { x: point[0], y: point[1], label: '', lore_entry_id: null, visible: false, category: 'other' };
			draftId = undefined;
		} else if (draft) {
			draft = { ...draft, x: point[0], y: point[1] };
		}
		tapMode = 'none';
		drawer = 'pin';
		return true;
	}

	function openPin(pin: MapPin) {
		selectedPinId = pin.id;
	}

	function editPin(pin: MapPin) {
		if (gm.isGm) {
			drawer = 'pin';
			const { id, ...rest } = pin;
			draft = { ...rest };
			draftId = id;
			error = '';
		}
	}

	async function saveDraft() {
		if (!draft || !currentMap || !gm.isGm) return;
		busy = true;
		const savingOn = currentMapId;
		const result = await savePin(draft, draftId, currentMap, savingOn);
		busy = false;
		if (savingOn !== currentMapId) return; // the map changed meanwhile: that pin isn't on this one
		if ('error' in result) {
			error = result.error;
			return;
		}
		pins = [...pins.filter((p) => p.id !== result.pin.id), result.pin];
		selectedPinId = result.pin.id;
		closeDraft();
	}

	async function removeDraft() {
		if (!draftId) return;
		const deletingId = draftId;
		const deletingOn = currentMapId;
		busy = true;
		const problem = await deletePin(deletingId);
		busy = false;
		if (deletingOn !== currentMapId) return;
		if (problem) {
			error = problem;
			return;
		}
		pins = pins.filter((p) => p.id !== deletingId);
		selectedPinId = undefined;
		closeDraft();
	}

	function closeDraft() {
		if (drawer === 'pin') drawer = null;
		draft = null;
		draftId = undefined;
		tapMode = 'none';
		error = '';
	}

	async function saveDistrict(override: DistrictOverride) {
		busy = true;
		const problem = await saveDistrictOverride(override);
		busy = false;
		if (problem) error = problem;
		else overrides = [...overrides.filter((o) => o.district_id !== override.district_id), override];
	}
</script>

<svelte:head><title>{campaign.name} MAP // CYBRDEK</title></svelte:head>

<div class="map-page" style:--site-header-height="{headerHeight}px">
	<div class="head">
		<h1 title={currentMap?.name ?? campaign.name}>{currentMap?.name ?? campaign.name}</h1>
		<button type="button" aria-haspopup="dialog" onclick={() => drawer = 'layers'}>LAYERS</button>
	</div>
	<div class="stage">
	{#if !currentMap}
		<div class="empty"><Panel title="NO MAP YET">
			{#if mapStatus === 'loading'}<p>LOADING…</p>
			{:else if mapStatus === 'offline'}<p>This campaign's map needs a connection the first time it opens on this device.</p>
			{:else if gm.isGm}<p>Upload a map below. Your players see it as soon as it's added.</p>
			{:else}<p>Your GM hasn't added a map to this campaign yet.</p>{/if}
			{#if !isVoyage && (gm.isGm || canUpload || hasOwnMaps)}<button type="button" onclick={() => drawer = 'layers'}>MANAGE MAPS</button>{/if}
		</Panel></div>
	{:else}
		{#snippet pinMarkers(scale: number)}
			{#each shownPins as pin (pin.id)}
				<!-- Accessible pin selection is also available in Find a place. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<g data-map-interactive class="pin" class:hidden={!pin.visible} class:selected={pin.id === selectedPinId} onclick={() => openPin(pin)} role="button" tabindex="-1">
					<circle cx={pin.x} cy={pin.y} r={22 / scale} class="hit" />
					<circle cx={pin.x} cy={pin.y} r={9 / scale} class="dot" style:stroke-width={2.5 / scale} />
				</g>
			{/each}
			{#if draft}<circle cx={draft.x} cy={draft.y} r={11 / scale} class="draft" style:stroke-width={2.5 / scale} />{/if}
		{/snippet}
		<CityMap map={currentMap} areas={isVoyage ? districts : []} immersive selectionPopup={false}
			{outlines} focus={mapFocus} bind:selectedId={selectedDistrictId}
			onselect={() => selectedPinId = undefined} ontap={tapped} overlay={pinMarkers} />
		{#if !draft && tapMode === 'none'}
			{#if selectedPin}
				<aside class="selection pin-card" aria-label="Selected place" aria-live="polite">
					<button class="close" type="button" aria-label="Close place card" onclick={() => selectedPinId = undefined}>×</button>
					<span class="kicker">PLACE</span>
					<h2>{selectedPin.label}</h2>
					{#if !selectedPin.visible}<p class="dim">GM ONLY</p>{/if}
					{#if selectedPinLore?.summary}<p>{selectedPinLore.summary}</p>{/if}
					<div class="card-actions">
						{#if selectedPinLore}<a class="read" href="/lore/{selectedPinLore.slug}">READ LORE →</a>{/if}
						{#if gm.isGm}<button type="button" onclick={() => editPin(selectedPin)}>EDIT PIN</button>{/if}
					</div>
				</aside>
			{:else if menuPlaces}
				<aside class="selection" aria-label="Selected district" aria-live="polite">
					<DistrictMenu places={menuPlaces} focusWardId={selectedDistrict?.kind === 'ward' ? selectedDistrict.id : undefined}
						{selectedPinId} isGm={gm.isGm} loreFor={loreForArea} pinLore={(pin) => pinLore(pin, entries)} onpick={openPin}
						onclose={() => selectedDistrictId = undefined} />
					{#if gm.isGm}<button class="edit-district" type="button" onclick={() => drawer = 'district'}>EDIT DISTRICT</button>{/if}
				</aside>
			{/if}
		{/if}
	{/if}
	</div>
	<div class="dock">
		{#if tapMode !== 'none'}
			<p role="status">{tapMode === 'move' ? 'TAP TO MOVE PIN' : 'TAP THE MAP…'}</p>
			<button type="button" onclick={closeDraft}>CANCEL</button>
		{:else}
			<button class="find" type="button" aria-haspopup="dialog" disabled={!currentMap} onclick={() => drawer = 'finder'}>⌕ &nbsp; Find a place</button>
			{#if gm.isGm && currentMap}<button class="add" type="button" onclick={() => { closeDraft(); tapMode = 'place'; }}>+ PIN</button>{/if}
		{/if}
	</div>
</div>

<MapDrawer open={drawer === 'finder'} title="Find a place" onclose={() => drawer = null}>
	{#if drawer === 'finder'}<MapFinder areas={isVoyage ? districts : []} pins={visiblePins}
		onarea={(area) => { drawer = null; mapFocus = { area }; }}
		onpin={(pin) => { drawer = null; openPin(pin); mapFocus = { point: [pin.x, pin.y] }; }} />{/if}
</MapDrawer>
<MapDrawer open={drawer === 'layers'} title="Layers" onclose={() => drawer = null}>
	<div class="layer-options">
		<label><input type="checkbox" bind:checked={showPins} /> Places & pins</label>
		{#if isVoyage}<label><input type="checkbox" bind:checked={outlines} /> District outlines</label>{/if}
	</div>
	<p class="dim">Drag to pan · pinch or scroll to zoom. Keyboard: arrows to pan, +/− to zoom, Home to recenter.</p>
	{#if !isVoyage && (gm.isGm || canUpload || hasOwnMaps)}
		<MapManager campaignId={campaign.id} {maps} onchange={() => void load()} isGm={gm.isGm} userId={gm.userId} canUpload={gm.isGm || canUpload} {playersUpload} />
	{/if}
</MapDrawer>
<MapDrawer open={drawer === 'pin' && !!draft && gm.isGm} title="Pin details" onclose={closeDraft}>
	{#if gm.isGm && draft && currentMap}
		{#key draftId ?? 'new'}<PinEditor map={currentMap} bind:draft isNew={!draftId} {entries} moving={tapMode === 'move'} {busy} {error}
			onsave={saveDraft} ondelete={removeDraft} onmove={() => { tapMode = 'move'; drawer = null; }} oncancel={closeDraft} />{/key}
	{/if}
</MapDrawer>
<MapDrawer open={drawer === 'district' && gm.isGm && !!selectedDistrict} title="District details" onclose={() => drawer = null}>
	{#if gm.isGm && selectedDistrict}
		{#key selectedDistrict.id}<DistrictEditor district={selectedDistrict} override={overrideFor(selectedDistrict.id)} {entries} {busy} {error} onsave={saveDistrict} />{/key}
	{/if}
</MapDrawer>

<style>
	:global(.shell:has(.map-page)) { max-width: none; padding: 0; }
	.map-page { height: calc(100dvh - var(--site-header-height)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
	.head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0.75rem; background: var(--bg-0); border-bottom: 1px solid var(--frame-dim); }
	h1 { margin: 0; font-size: clamp(0.8rem, 2vw, 1.2rem); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	button, .read { min-width: 44px; min-height: 44px; }
	.head button { flex-shrink: 0; }
	.stage { position: relative; min-height: 0; overflow: hidden; }
	.empty { padding: 1rem; }
	.dock { display: flex; gap: 0.5rem; padding: 0.65rem 0.75rem max(0.65rem, env(safe-area-inset-bottom)); background: var(--bg-1); border-top: 1px solid var(--frame-dim); }
	.find, .dock p { flex: 1; text-align: left; }
	.dock p { margin: 0; align-self: center; color: var(--bright); }
	.add { color: var(--bright); border-color: var(--bright-dim); }
	/* The selected place or district: a compact red-framed card inset from the map's edges (#101 mockup A). */
	.selection { position: absolute; bottom: 0.75rem; left: 0.75rem; right: 0.75rem; max-width: 24rem; max-height: min(55%, 30rem); overflow-y: auto; overscroll-behavior: contain; padding: 0.85rem 1rem; background: var(--bg-1); border: 1px solid var(--red); box-shadow: 0 8px 30px var(--bg-0); }
	@media (min-width: 700px) { .selection { left: 1rem; bottom: 1rem; } }
	.pin-card h2 { margin: 0 0 0.5rem; padding-right: 2.75rem; color: var(--bright); font-family: var(--f-label); font-size: 0.95rem; font-weight: normal; letter-spacing: 0.04em; line-height: 1.4; text-shadow: none; overflow-wrap: anywhere; }
	.pin-card p { margin: 0 0 0.6rem; }
	.kicker { font-family: var(--f-label); font-size: 0.55rem; letter-spacing: 0.16em; color: var(--muted); }
	.pin-card .kicker + h2 { margin-top: 0.3rem; }
	.close { position: absolute; top: 0.3rem; right: 0.3rem; border-color: transparent; background: transparent; box-shadow: none; font-size: 1.25rem; }
	.card-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.read { display: inline-flex; align-items: center; color: var(--bright); }
	.edit-district { margin: 0.75rem 0 0; }
	.dim { color: var(--muted); }
	.layer-options { display: grid; gap: 0.5rem; }
	.layer-options label { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; }
	:global(.pin) { cursor: pointer; }
	:global(.pin .hit) { fill: transparent; }
	:global(.pin .dot) { fill: var(--bright); stroke: var(--bg-0); }
	:global(.pin.hidden .dot) { fill: var(--bg-1); stroke: var(--bright); stroke-dasharray: 2 2; }
	:global(.pin.selected .dot) { fill: var(--red); }
	:global(circle.draft) { fill: var(--red); stroke: var(--value); pointer-events: none; }
</style>
