<script lang="ts">
	import { untrack } from 'svelte';
	import CityMap from '#lib/components/map/CityMap.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { AREA_NAME_MAX, areaLabel, movePoint, removeArea, replaceArea, validatePolygon } from '#lib/map/areas.ts';
	import type { MapArea, MapDefinition, Point } from '#lib/map/types.ts';

	let { map, areas, onchange }: {
		map: MapDefinition;
		areas: readonly MapArea[];
		/** Only complete, validated sets are emitted. The caller owns storage. */
		onchange: (areas: MapArea[]) => void;
	} = $props();

	let draft = $state<MapArea | null>(null);
	let mode = $state<'pan' | 'draw' | 'move'>('pan');
	let selectedPoint = $state<number | null>(null);
	let problems = $state<string[]>([]);
	let confirmingDelete = $state(false);
	let dragBefore: readonly Point[] | undefined;
	const districts = $derived(areas.filter((a) => a.kind === 'district' && a.id !== draft?.id));
	const existing = $derived(areas.some((a) => a.id === draft?.id));
	const shapeProblems = $derived(draft ? validatePolygon(draft.polygon, map) : []);

	// A different map or externally replaced area set starts a fresh editing session.
	$effect(() => {
		void map.imageUrl; void map.width; void map.height; void areas;
		untrack(cancel);
	});

	function cancel() {
		draft = null; mode = 'pan'; selectedPoint = null; problems = []; confirmingDelete = false;
	}
	function create() {
		cancel();
		draft = { id: crypto.randomUUID(), name: '', kind: 'district', polygon: [], label: [0, 0], boundary: 'drawn' };
		mode = 'draw';
	}
	function pick(area: MapArea | undefined) {
		if (!area) return;
		cancel();
		draft = { ...area, polygon: area.polygon.map((p) => [...p] as Point) };
		mode = 'move';
	}
	function tap(point: Point): boolean {
		if (!draft || mode === 'pan') return false;
		if (mode === 'draw') draft = { ...draft, polygon: [...draft.polygon, point] };
		else if (selectedPoint !== null) draft = { ...draft, polygon: movePoint(draft.polygon, selectedPoint, point, map) };
		problems = [];
		return true;
	}
	function drag(handle: string, point: Point, phase: 'start' | 'move' | 'end' | 'cancel') {
		if (!draft) return;
		const index = Number(handle);
		if (phase === 'start') { dragBefore = draft.polygon; selectedPoint = index; }
		if (phase === 'cancel') {
			if (dragBefore) draft = { ...draft, polygon: dragBefore };
		} else if (phase !== 'start') draft = { ...draft, polygon: movePoint(draft.polygon, index, point, map) };
		if (phase === 'end' || phase === 'cancel') dragBefore = undefined;
		problems = [];
	}
	function coordinate(axis: 0 | 1, value: number) {
		if (!draft || selectedPoint === null) return;
		const point = [...draft.polygon[selectedPoint]] as [number, number];
		point[axis] = value;
		draft = { ...draft, polygon: movePoint(draft.polygon, selectedPoint, point, map) };
	}
	function removePoint(index: number) {
		if (!draft) return;
		draft = { ...draft, polygon: draft.polygon.filter((_, i) => i !== index) };
		selectedPoint = null; problems = [];
	}
	function save() {
		if (!draft) return;
		if (shapeProblems.length) { problems = shapeProblems; return; }
		const area = { ...draft, name: draft.name.trim(), label: areaLabel(draft.polygon), parentId: draft.kind === 'ward' ? draft.parentId : undefined };
		const result = replaceArea(areas, area, map);
		if (!result.ok) { problems = result.problems; return; }
		onchange(result.areas);
		cancel();
	}
	function remove() {
		if (!draft) return;
		const result = removeArea(areas, draft.id);
		if (!result.ok) { problems = result.problems; confirmingDelete = false; return; }
		onchange(result.areas);
		cancel();
	}
</script>

<Panel title="AREA EDITOR">
	<div class="actions">
		<button type="button" onclick={create}>NEW AREA</button>
		<label>EDIT AREA
			<select aria-label="Edit area" value={existing ? draft?.id : ''} onchange={(e) => pick(areas.find((a) => a.id === e.currentTarget.value))}>
				<option value="">Choose an area…</option>
				{#each areas as area (area.id)}<option value={area.id}>{area.name} · {area.kind}</option>{/each}
			</select>
		</label>
	</div>
	{#if draft}
		<div class="fields">
			<label>AREA NAME<input aria-label="Area name" maxlength={AREA_NAME_MAX} bind:value={draft.name} /></label>
			<label>KIND<select aria-label="Area kind" bind:value={draft.kind}>
				<option value="district">District</option><option value="ward">Ward</option>
			</select></label>
			{#if draft.kind === 'ward'}
				<label>DISTRICT<select aria-label="Ward district" bind:value={draft.parentId}>
					<option value={undefined}>Choose a district…</option>
					{#each districts as district (district.id)}<option value={district.id}>{district.name}</option>{/each}
				</select></label>
			{/if}
		</div>
		<div class="actions" role="group" aria-label="Area tools">
			<button type="button" aria-pressed={mode === 'draw'} onclick={() => mode = 'draw'}>DRAW POINTS</button>
			<button type="button" aria-pressed={mode === 'move'} onclick={() => mode = 'move'}>MOVE POINTS</button>
			<button type="button" aria-pressed={mode === 'pan'} onclick={() => mode = 'pan'}>PAN MAP</button>
			<button type="button" disabled={!draft.polygon.length} onclick={() => removePoint(draft!.polygon.length - 1)}>UNDO LAST POINT</button>
		</div>
		<p class="hint" role="status">{mode === 'draw' ? 'Tap inside the image to add points. Save closes the outline.' : mode === 'move' ? 'Drag a point, or select its number below and tap its new position. Pan mode lets you pinch and drag the map.' : 'Drag to pan and pinch to zoom. Tap an area to edit it.'}</p>
	{:else}<p class="hint">Choose NEW AREA to draw, or select an existing area to edit.</p>{/if}
</Panel>

{#snippet handles(scale: number)}
	{#if draft}
		<polygon points={draft.polygon.map((p) => p.join(',')).join(' ')} class="draft-edge" />
		<polygon points={draft.polygon.map((p) => p.join(',')).join(' ')} class="draft-shape" />
		{#each draft.polygon as p, i (i)}
			<g data-map-interactive={mode === 'move' ? '' : undefined} data-map-handle={mode === 'move' ? i : undefined}>
				<circle cx={p[0]} cy={p[1]} r={22 / scale} class="point-hit" />
				<circle cx={p[0]} cy={p[1]} r={7 / scale} class="point-dot" class:chosen={i === selectedPoint} style:stroke-width={2 / scale} />
				<text class="point-label" x={p[0]} y={p[1] - 12 / scale} style:font-size="{13 / scale}px" style:stroke-width={3 / scale}>{i + 1}</text>
			</g>
		{/each}
	{/if}
{/snippet}
<CityMap {map} {areas} outlines selectionPopup={false} ontap={tap} onpointdrag={drag} onselect={pick} overlay={handles} />

{#if draft}
	<Panel title="EDIT POINTS">
		<div class="points" role="group" aria-label="Polygon points">
			{#each draft.polygon as p, i (i)}
				<button type="button" aria-label="Point {i + 1}" aria-pressed={selectedPoint === i} onclick={() => { selectedPoint = i; mode = 'move'; }}>#{i + 1} · {Math.round(p[0])}, {Math.round(p[1])}</button>
			{/each}
		</div>
		{#if selectedPoint !== null}
			<div class="fields">
				<label>X<input aria-label="Point X" type="number" min="0" max={map.width} value={Math.round(draft.polygon[selectedPoint][0])} onchange={(e) => coordinate(0, e.currentTarget.valueAsNumber)} /></label>
				<label>Y<input aria-label="Point Y" type="number" min="0" max={map.height} value={Math.round(draft.polygon[selectedPoint][1])} onchange={(e) => coordinate(1, e.currentTarget.valueAsNumber)} /></label>
				<button type="button" onclick={() => removePoint(selectedPoint!)}>REMOVE POINT</button>
			</div>
		{/if}
		<p class="hint">{draft.polygon.length} points · unsaved until SAVE AREA.</p>
		{#if problems.length}<ul class="error" role="alert">{#each problems as problem}<li>{problem}</li>{/each}</ul>{/if}
		<div class="actions">
			<button type="button" class="save" onclick={save}>SAVE AREA</button>
			<button type="button" onclick={cancel}>CANCEL EDIT</button>
			{#if existing}
				{#if confirmingDelete}<button type="button" onclick={remove}>CONFIRM DELETE AREA</button>
				{:else}<button type="button" onclick={() => confirmingDelete = true}>DELETE AREA</button>{/if}
			{/if}
		</div>
	</Panel>
{/if}

<style>
	.actions, .points { display: flex; flex-wrap: wrap; align-items: end; gap: 0.5rem; }
	.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.5rem; margin: 0.75rem 0; align-items: end; }
	label { display: grid; gap: 0.3rem; min-width: 0; }
	select, input { width: 100%; min-width: 0; }
	button, select, input { min-height: 44px; max-width: 100%; }
	button { white-space: normal; }
	.actions label { flex: 1; min-width: 9rem; }
	.hint { color: var(--muted); }
	.error { color: var(--red-soft); }
	button[aria-pressed='true'], .save { color: var(--mint); border-color: var(--mint-dim); }
	:global(.draft-edge) { fill: none; stroke: var(--bg-0); stroke-width: 4; vector-effect: non-scaling-stroke; }
	:global(.draft-shape) { fill: var(--mint); fill-opacity: 0.15; stroke: var(--mint); stroke-width: 2; vector-effect: non-scaling-stroke; }
	:global(.point-hit) { fill: transparent; }
	:global(.point-dot) { fill: var(--bg-0); stroke: var(--mint); }
	:global(.point-dot.chosen) { fill: var(--red); }
	:global([data-map-handle]) { cursor: move; }
	:global(.point-label) { fill: var(--value); stroke: var(--bg-0); paint-order: stroke; pointer-events: none; text-anchor: middle; }
</style>
