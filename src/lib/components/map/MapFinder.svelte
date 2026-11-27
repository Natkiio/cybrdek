<script lang="ts">
	import type { District } from '#lib/map/districts.ts';
	import { PIN_CATEGORY_LABELS, type MapPin } from '#lib/map/pins.ts';
	let { areas, pins, onarea, onpin }: { areas: District[]; pins: MapPin[]; onarea: (area: District) => void; onpin: (pin: MapPin) => void } = $props();
	let query = $state('');
	const matches = (name: string) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
	const places = $derived(pins.filter(p => matches(p.label)).toSorted((a, b) => a.label.localeCompare(b.label)));
	const districts = $derived(areas.filter(a => matches(a.name)));
</script>

<label>FIND A PLACE<input data-initial-focus type="search" bind:value={query} placeholder="Place, district or ward…" /></label>
<div class="results" aria-label="Map search results">
	{#if places.length}<h3>PLACES ({places.length})</h3>{/if}
	{#each places as pin (pin.id)}
		<button type="button" aria-label={pin.label} onclick={() => onpin(pin)}><span>{pin.label}</span><small>{PIN_CATEGORY_LABELS[pin.category]}{pin.visible ? '' : ' · GM ONLY'}</small></button>
	{/each}
	{#if districts.length}<h3>DISTRICTS & WARDS</h3>{/if}
	{#each districts as area (area.id)}
		<button type="button" aria-label={area.name} onclick={() => onarea(area)}><span>{area.name}</span><small>{area.kind}</small></button>
	{/each}
	{#if !places.length && !districts.length}<p>No places found.</p>{/if}
</div>

<style>
	label { display: grid; gap: 0.5rem; color: var(--label); }
	input, button { min-height: 44px; min-width: 44px; }
	.results { display: grid; gap: 0.4rem; margin-top: 1rem; }
	button { display: grid; gap: 0.2rem; text-align: left; }
	small { color: var(--muted); font-size: 0.7rem; text-transform: uppercase; }
	h3 { margin: 0.7rem 0 0; font-size: 0.8rem; color: var(--label); }
</style>
