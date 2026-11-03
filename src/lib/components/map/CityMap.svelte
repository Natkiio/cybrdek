<script lang="ts">
	import { untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import { DISTRICTS, MAP_HEIGHT, MAP_WIDTH, type District, type Point } from '#lib/map/districts.ts';
	import { constrain, districtAt, fitMap, fitScale, focusDistrict, mapPoint, MAX_ZOOM, resizeView, zoomAt, type Size, type Transform } from '#lib/map/geometry.ts';

	export interface DistrictInfo { summary?: string; href?: string }
	let { districts = DISTRICTS, districtInfo, onselect, overlay }: {
		districts?: readonly District[];
		/** The caller resolves lore and visibility. Undefined means no lore is available. */
		districtInfo?: (district: District) => DistrictInfo | undefined;
		onselect?: (district: District | undefined) => void;
		/** Optional SVG in image coordinates. Set data-map-interactive on future pin controls. */
		overlay?: Snippet;
	} = $props();

	let viewport: HTMLDivElement;
	let width = $state(0), height = $state(0);
	let view = $state<Transform>({ x: 0, y: 0, scale: 1 });
	let selectedId = $state<string | undefined>();
	let detailFailed = $state(false);
	let imageError = $state(false);
	let dragging = $state(false);
	const size: Size = $derived({ width, height });
	const zoom = $derived(width && height ? view.scale / fitScale(size) : 1);
	const detail = $derived(!detailFailed && (width > 700 || zoom > 1.8));
	const selected = $derived(districts.find((d) => d.id === selectedId));
	const info = $derived(selected ? districtInfo?.(selected) : undefined);
	let previousSize: Size | undefined;
	const pointers = new Map<number, Point>();
	let gesture: { view: Transform; center: Point; distance: number; moved: boolean } | undefined;

	$effect(() => {
		const next = { width, height };
		if (!width || !height) return;
		view = previousSize ? resizeView(untrack(() => view), previousSize, next) : fitMap(next);
		previousSize = next;
	});

	const local = (event: PointerEvent | WheelEvent): Point => {
		const rect = viewport.getBoundingClientRect();
		return [event.clientX - rect.left, event.clientY - rect.top];
	};
	function pointerCenter(): Point {
		const points = [...pointers.values()].slice(0, 2);
		return [points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[1], 0) / points.length];
	}
	function pointerDistance() {
		const [a, b] = [...pointers.values()];
		return b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
	}
	function startGesture(moved = false) {
		gesture = pointers.size ? { view: { ...view }, center: pointerCenter(), distance: pointerDistance(), moved } : undefined;
	}
	function down(event: PointerEvent) {
		if (event.button !== 0 || (event.target instanceof Element && event.target.closest('[data-popup], [data-map-interactive]'))) return;
		event.preventDefault();
		viewport.focus({ preventScroll: true });
		pointers.set(event.pointerId, local(event));
		viewport.setPointerCapture(event.pointerId);
		startGesture(pointers.size > 1);
	}
	function move(event: PointerEvent) {
		if (!pointers.has(event.pointerId) || !gesture) return;
		pointers.set(event.pointerId, local(event));
		const center = pointerCenter();
		const dx = center[0] - gesture.center[0], dy = center[1] - gesture.center[1];
		if (Math.hypot(dx, dy) > 5 || pointers.size > 1) gesture.moved = true;
		dragging = gesture.moved;
		view = pointers.size > 1 && gesture.distance > 0
			? zoomAt(gesture.view, gesture.center, pointerDistance() / gesture.distance, size, center)
			: constrain({ ...gesture.view, x: gesture.view.x + dx, y: gesture.view.y + dy }, size);
	}
	function up(event: PointerEvent, cancelled = false) {
		if (!pointers.has(event.pointerId)) return;
		const tapped = !cancelled && pointers.size === 1 && !gesture?.moved;
		pointers.delete(event.pointerId);
		if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
		if (tapped) select(districtAt(districts, mapPoint(local(event), view)));
		startGesture(true); // releasing one finger must not turn a pinch into a district tap
		dragging = false;
	}
	function select(district: District | undefined, focus = false) {
		selectedId = district?.id;
		if (district && focus) view = focusDistrict(district, size);
		onselect?.(district);
	}
	function wheel(event: WheelEvent) {
		event.preventDefault();
		view = zoomAt(view, local(event), Math.exp(-event.deltaY * 0.002), size);
	}
	function zoomBy(factor: number) { view = zoomAt(view, [width / 2, height / 2], factor, size); }
	function pan(dx: number, dy: number) { view = constrain({ ...view, x: view.x + dx, y: view.y + dy }, size); }
	function keys(event: KeyboardEvent) {
		if (event.target !== viewport) return;
		const directions: Record<string, Point> = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] };
		if (directions[event.key]) { event.preventDefault(); pan(...directions[event.key]); }
		else if (['+', '='].includes(event.key)) { event.preventDefault(); zoomBy(1.5); }
		else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.5); }
		else if (event.key === 'Home') { event.preventDefault(); view = fitMap(size); }
		else if (event.key === 'Escape') select(undefined);
	}
</script>

<div class="toolbar" role="group" aria-label="Map controls">
	<button type="button" aria-label="Zoom out" disabled={zoom <= 1.001} onclick={() => zoomBy(1 / 1.5)}>−</button>
	<output aria-label="Map zoom">{Math.round(zoom * 100)}%</output>
	<button type="button" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM - 0.001} onclick={() => zoomBy(1.5)}>+</button>
	<button type="button" onclick={() => view = fitMap(size)}>FIT MAP</button>
	<div class="pan-controls" role="group" aria-label="Pan map">
		<button type="button" aria-label="Pan left" onclick={() => pan(100, 0)}>←</button>
		<button type="button" aria-label="Pan up" onclick={() => pan(0, 100)}>↑</button>
		<button type="button" aria-label="Pan down" onclick={() => pan(0, -100)}>↓</button>
		<button type="button" aria-label="Pan right" onclick={() => pan(-100, 0)}>→</button>
	</div>
</div>
<p id="map-help" class="hint">Drag to pan · pinch or scroll to zoom · tap a district. Keyboard: arrows, +/−, Home to fit, Escape to close.</p>

<!-- A custom keyboard-operated map application; the district list is an alternative to spatial input. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="viewport" class:dragging bind:this={viewport} bind:clientWidth={width} bind:clientHeight={height}
	role="application" aria-label="Voyage City interactive map" aria-describedby="map-help" tabindex="0"
	onpointerdown={down} onpointermove={move} onpointerup={(event) => up(event)} onpointercancel={(event) => up(event, true)}
	onlostpointercapture={(event) => up(event, true)} onwheel={wheel} onkeydown={keys}>
	<div class="scene" style:transform="translate({view.x}px, {view.y}px) scale({view.scale})">
		<img src={detail ? '/maps/voyage-detail.webp' : '/maps/voyage-overview.webp'}
			width={MAP_WIDTH} height={MAP_HEIGHT} alt="Voyage City street map in red and black" draggable="false"
			onerror={() => { if (detail) detailFailed = true; else imageError = true; }} />
		<svg viewBox="0 0 {MAP_WIDTH} {MAP_HEIGHT}" width={MAP_WIDTH} height={MAP_HEIGHT} aria-hidden="true">
			{#each districts as district (district.id)}
				<polygon points={district.polygon.map((p) => p.join(',')).join(' ')} class:selected={selectedId === district.id} />
			{/each}
			{@render overlay?.()}
		</svg>
	</div>
	{#if imageError}<p class="error" role="alert">The map image could not load. Reconnect and reload this page.</p>{/if}
	{#if selected}
		<aside class="popup" data-popup aria-label="Selected district" aria-live="polite">
			<button class="close" type="button" aria-label="Close district popup" onclick={() => select(undefined)}>×</button>
			<strong>{selected.name}</strong>
			{#if info?.summary}<p>{info.summary}</p>{/if}
			{#if info?.href}<a href={info.href}>READ LORE →</a>{/if}
		</aside>
	{/if}
</div>

<details class="districts">
	<summary>CHOOSE A DISTRICT <span class="hint">({districts.length})</span></summary>
	<div class="district-list">
		{#each districts as district (district.id)}
			<button type="button" aria-pressed={selectedId === district.id} onclick={() => select(district, true)}>{district.name}</button>
		{/each}
	</div>
</details>

<style>
	.toolbar, .pan-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
	.pan-controls { margin-left: auto; }
	button { min-width: 44px; min-height: 44px; }
	output { min-width: 4ch; color: var(--mint); text-align: center; }
	.hint { color: var(--muted); font-size: 0.8rem; }
	.viewport { position: relative; width: 100%; height: clamp(22rem, 62svh, 42rem); overflow: hidden; border: 1px solid var(--frame-dim); background: var(--bg-0); touch-action: none; user-select: none; cursor: grab; }
	.viewport:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
	.viewport.dragging { cursor: grabbing; }
	.scene { position: absolute; left: 0; top: 0; width: 3840px; height: 2160px; transform-origin: 0 0; }
	.scene img, .scene svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.scene img { max-width: none; }
	.scene svg { pointer-events: none; }
	.scene svg :global([data-map-interactive]) { pointer-events: auto; }
	polygon { fill: transparent; stroke: transparent; vector-effect: non-scaling-stroke; }
	polygon.selected { fill: var(--mint); fill-opacity: 0.18; stroke: var(--mint); stroke-width: 2; }
	.popup { position: absolute; left: 0.75rem; right: 0.75rem; bottom: 0.75rem; max-width: 23rem; max-height: 45%; overflow-y: auto; padding: 0.8rem 3rem 0.8rem 0.9rem; border: 1px solid var(--mint-dim); background: var(--bg-1); color: var(--value); cursor: auto; user-select: text; touch-action: pan-y; }
	.popup strong { color: var(--mint); }
	.popup p { margin: 0.4rem 0; }
	.popup a { display: inline-flex; align-items: center; min-height: 44px; color: var(--mint); }
	.close { position: absolute; top: 0; right: 0; padding: 0.4rem; border: none; }
	.error { position: absolute; top: 0; left: 0; padding: 1rem; color: var(--red-soft); background: var(--bg-1); }
	summary { min-height: 44px; cursor: pointer; padding: 0.75rem 0; color: var(--label); }
	.district-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.4rem; }
	.district-list button { text-align: left; }
	button[aria-pressed='true'] { color: var(--mint); border-color: var(--mint-dim); }
</style>
