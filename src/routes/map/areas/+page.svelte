<script lang="ts">
	import { onDestroy } from 'svelte';
	import AreaEditor from '#lib/components/map/AreaEditor.svelte';
	import { DISTRICTS, VOYAGE_MAP } from '#lib/map/districts.ts';
	import type { MapArea, MapDefinition } from '#lib/map/types.ts';

	const practice: MapDefinition = { name: 'Practice floorplan', imageUrl: '/maps/area-sandbox.svg', width: 900, height: 600 };
	let map = $state<MapDefinition>(practice);
	let areas = $state<MapArea[]>([]);
	let error = $state('');
	let objectUrl: string | undefined;
	let generation = 0;
	function release() { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = undefined; }
	onDestroy(() => { generation++; release(); });
	function preset(voyage: boolean) {
		generation++; release(); error = '';
		map = voyage ? VOYAGE_MAP : practice;
		areas = voyage ? [...structuredClone(DISTRICTS)] : [];
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const current = ++generation;
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.src = url;
		try {
			await image.decode();
			if (current !== generation) return;
			if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
			release(); objectUrl = url;
			map = { name: file.name, imageUrl: url, width: image.naturalWidth, height: image.naturalHeight };
			areas = []; error = '';
		} catch {
			if (current === generation) error = 'This image could not be opened. Choose another image file.';
		} finally {
			if (objectUrl !== url) URL.revokeObjectURL(url);
			input.value = '';
		}
	}
</script>

<svelte:head><title>MAP AREAS // CYBRDEK</title></svelte:head>
<h1>MAP AREA SANDBOX</h1>
<p>Draw on any image. Changes stay in this tab and disappear on reload. Choosing another map clears the current edits.</p>
<div class="choices">
	<button type="button" onclick={() => preset(false)}>PRACTICE MAP</button>
	<button type="button" onclick={() => preset(true)}>VOYAGE CITY</button>
	<label>OPEN YOUR MAP<input aria-label="Open map image" type="file" accept="image/*" onchange={upload} /></label>
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<p class="hint">{map.name} · {map.width} × {map.height} · <output aria-label="Area count">{areas.length}</output> areas</p>
<AreaEditor {map} {areas} onchange={(next) => areas = next} />

<style>
	.choices { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; margin: 1rem 0; }
	label { display: grid; gap: 0.3rem; min-width: 0; max-width: 100%; }
	button, input { min-height: 44px; max-width: 100%; }
	.hint { color: var(--muted); }
	.error { color: var(--red-soft); }
</style>
