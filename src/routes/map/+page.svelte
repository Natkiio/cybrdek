<script lang="ts">
	import { untrack } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import CityMap from '#lib/components/map/CityMap.svelte';
	import DistrictEditor from '#lib/components/map/DistrictEditor.svelte';
	import DistrictMenu from '#lib/components/map/DistrictMenu.svelte';
	import PinEditor from '#lib/components/map/PinEditor.svelte';
	import MapManager from '#lib/components/map/MapManager.svelte';
	import { listMaps, loadMapDefinition, type CampaignMap } from '#lib/map/campaign-maps.ts';
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
	const activeMap = $derived(maps.find((m) => m.active));
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

	const overrideFor = (id: string) => overrides.find((o) => o.district_id === id);
	const districts = $derived(
		DISTRICTS.map((d) => ({ ...d, name: resolveDistrict(d, overrideFor(d.id), entries).name }))
	);
	const selectedDistrict = $derived(districts.find((d) => d.id === selectedDistrictId));
	// The menu always shows a whole district; a tapped ward is highlighted in it.
	const menuDistrict = $derived(selectedDistrict ? districtOf(selectedDistrict, districts) : undefined);
	const menuPlaces = $derived(menuDistrict ? placesInDistrict(menuDistrict, districts, pins) : undefined);
	const loreForArea = (area: District) => resolveDistrict(area, overrideFor(area.id), entries).lore;
	const selectedPin = $derived(pins.find((p) => p.id === selectedPinId));
	const selectedPinLore = $derived(selectedPin ? pinLore(selectedPin, entries) : null);
	const shownPins = $derived(pins.filter((p) => p.id !== draftId));

	function districtInfo(district: District) {
		const lore = resolveDistrict(district, overrideFor(district.id), entries).lore;
		return lore ? { summary: lore.summary || undefined, href: `/lore/${lore.slug}` } : undefined;
	}

	// ---- loading: everything again when GM mode changes (RLS decides what we get)
	const latest = latestOnly();
	// The active map, remembered per campaign so it opens offline too.
	const savedMapKey = (id: string) => `cybrdek:active-map:${id}`;
	function rememberMaps(campaignId: string, list: CampaignMap[]) {
		try {
			localStorage.setItem(savedMapKey(campaignId), JSON.stringify(list.find((m) => m.active) ?? null));
		} catch {
			// storage blocked: the map just needs a connection next time
		}
	}
	function savedActiveMap(campaignId: string): CampaignMap[] {
		try {
			const saved = JSON.parse(localStorage.getItem(savedMapKey(campaignId)) ?? 'null');
			return saved && typeof saved.id === 'string' ? [saved as CampaignMap] : [];
		} catch {
			return [];
		}
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
				uploaded?.release();
				uploaded = { map: remembered, ...local };
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
			uploaded = { ...uploaded, map: active };
			return;
		}
		const loaded = active ? await loadMapDefinition(campaignId, active) : null;
		if (!current()) {
			loaded?.release();
			return;
		}
		uploaded?.release();
		uploaded = loaded && active ? { map: active, ...loaded } : null;
		mapStatus = active && !loaded ? 'offline' : 'ready';
	}

	async function load() {
		const current = latest.begin();
		const campaignId = campaign.id;
		if (campaignId !== VOYAGE_CITY_ID) await loadUploadedMap(campaignId, current);
		else if (uploaded) {
			uploaded.release();
			uploaded = null;
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
		// Only gm.isGm is a dependency; untrack the rest so writing them doesn't re-run this.
		if (!gm.isGm) {
			untrack(() => {
				// Leaving GM mode: drop GM-only things from screen now.
				entries = entries.filter((e) => e.visible);
				pins = pins.filter((p) => p.visible);
				draft = null;
				tapMode = 'none';
			});
		}
		void campaign.id; // another campaign: its own map and pins
		void load();
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
		return true;
	}

	function openPin(pin: MapPin) {
		selectedPinId = pin.id;
		if (gm.isGm) {
			const { id, ...rest } = pin;
			draft = { ...rest };
			draftId = id;
			error = '';
		}
	}

	async function saveDraft() {
		if (!draft) return;
		busy = true;
		if (!currentMap) return;
		const result = await savePin(draft, draftId, currentMap, currentMapId);
		busy = false;
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
		busy = true;
		const problem = await deletePin(draftId);
		busy = false;
		if (problem) {
			error = problem;
			return;
		}
		pins = pins.filter((p) => p.id !== draftId);
		selectedPinId = undefined;
		closeDraft();
	}

	function closeDraft() {
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

{#if !currentMap}
	<h1>{campaign.name}</h1>
	<Panel title="NO MAP YET">
		{#if mapStatus === 'loading'}
			<p class="dim">LOADING…</p>
		{:else if mapStatus === 'offline'}
			<p class="dim">This campaign's map needs a connection the first time it opens on this device.</p>
		{:else if gm.isGm}
			<p class="dim">Upload a map below. Your players see it as soon as it's added.</p>
		{:else}
			<p class="dim">Your GM hasn't added a map to this campaign yet.</p>
		{/if}
	</Panel>
{:else}
<div class="head">
	<h1>{isVoyage ? 'VOYAGE CITY' : currentMap.name}</h1>
	{#if gm.isGm}
		<button
			type="button"
			class="add"
			class:on={tapMode === 'place'}
			onclick={() => (tapMode = tapMode === 'place' ? 'none' : 'place')}
		>
			{tapMode === 'place' ? 'TAP THE MAP…' : '+ PIN'}
		</button>
	{/if}
</div>

{#snippet pinMarkers(scale: number)}
	{@const r = 9 / scale}
	{#each shownPins as pin (pin.id)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<g
			data-map-interactive
			class="pin"
			class:hidden={!pin.visible}
			class:selected={pin.id === selectedPinId}
			onclick={() => openPin(pin)}
			role="button"
			tabindex="-1"
		>
			<circle cx={pin.x} cy={pin.y} r={r * 2.4} class="hit" />
			<circle cx={pin.x} cy={pin.y} r={r} class="dot" style:stroke-width={2.5 / scale} />
		</g>
	{/each}
	{#if draft}
		<circle cx={draft.x} cy={draft.y} r={r * 1.2} class="draft" style:stroke-width={2.5 / scale} />
	{/if}
{/snippet}

<CityMap
	map={currentMap}
	areas={isVoyage ? districts : []}
	districtInfo={isVoyage ? districtInfo : undefined}
	onselect={(d) => {
		selectedDistrictId = d?.id;
		if (d) selectedPinId = undefined;
	}}
	ontap={tapped}
	overlay={pinMarkers}
/>

{#if selectedPin && !draft && !menuPlaces}
	<Panel title="PLACE">
		<p class="pin-name">{selectedPin.label}</p>
		{#if selectedPinLore?.summary}<p class="dim">{selectedPinLore.summary}</p>{/if}
		{#if selectedPinLore}<a class="read" href="/lore/{selectedPinLore.slug}">READ LORE →</a>{/if}
	</Panel>
{/if}

{#if gm.isGm && draft}
	{#key draftId ?? 'new'}
		<PinEditor
			map={currentMap}
			bind:draft
			isNew={!draftId}
			{entries}
			moving={tapMode === 'move'}
			{busy}
			{error}
			onsave={saveDraft}
			ondelete={removeDraft}
			onmove={() => (tapMode = 'move')}
			oncancel={closeDraft}
		/>
	{/key}
{/if}

{#if menuPlaces}
	<DistrictMenu
		places={menuPlaces}
		focusWardId={selectedDistrict?.kind === 'ward' ? selectedDistrict.id : undefined}
		{selectedPinId}
		isGm={gm.isGm}
		loreFor={loreForArea}
		pinLore={(pin) => pinLore(pin, entries)}
		onpick={openPin}
		onclose={() => {
			selectedDistrictId = undefined;
			selectedPinId = undefined;
		}}
	/>
{/if}

{#if gm.isGm && !draft && selectedDistrict}
	{#key selectedDistrict.id}
		<DistrictEditor
			district={selectedDistrict}
			override={overrideFor(selectedDistrict.id)}
			{entries}
			{busy}
			{error}
			onsave={saveDistrict}
		/>
	{/key}
{/if}

{#if pins.length}
	<details class="places">
		<summary>PLACES <span class="dim">({pins.length})</span></summary>
		<div class="place-list">
			{#each [...pins].sort((a, b) => a.label.localeCompare(b.label)) as pin (pin.id)}
				<button type="button" aria-pressed={pin.id === selectedPinId} onclick={() => openPin(pin)}>
					{pin.label}{pin.visible ? '' : ' · GM only'}
				</button>
			{/each}
		</div>
	</details>
{/if}

{/if}

{#if !isVoyage && gm.isGm}
	<MapManager campaignId={campaign.id} {maps} onchange={() => void load()} />
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.add {
		min-height: 44px;
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.add.on {
		color: var(--red);
		border-color: var(--red);
		box-shadow: 0 0 10px var(--red-glow);
	}

	:global(.pin) {
		cursor: pointer;
	}

	:global(.pin .hit) {
		fill: transparent;
	}

	:global(.pin .dot) {
		fill: var(--mint);
		stroke: var(--bg-0);
	}

	:global(.pin.hidden .dot) {
		fill: var(--bg-1);
		stroke: var(--mint);
		stroke-dasharray: 2 2;
	}

	:global(.pin.selected .dot) {
		fill: var(--red);
	}

	:global(circle.draft) {
		fill: var(--red);
		stroke: var(--value);
		pointer-events: none;
	}

	.pin-name {
		color: var(--mint);
		font-size: 1.1rem;
		margin: 0 0 0.25rem;
	}

	.read {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--mint);
	}

	.dim {
		color: var(--muted);
	}

	summary {
		min-height: 44px;
		cursor: pointer;
		padding: 0.75rem 0;
		color: var(--label);
	}

	.place-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.4rem;
	}

	.place-list button {
		min-height: 44px;
		text-align: left;
	}

	button[aria-pressed='true'] {
		color: var(--mint);
		border-color: var(--mint-dim);
	}
</style>
