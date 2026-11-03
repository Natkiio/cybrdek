<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import type { LoreEntry } from '#lib/lore/types.ts';
	import type { District } from '#lib/map/districts.ts';
	import { PIN_CATEGORY_LABELS, type DistrictPlaces, type MapPin } from '#lib/map/pins.ts';

	// Tap a district → this menu: each ward as a header, its places underneath.
	let {
		places,
		focusWardId,
		selectedPinId,
		isGm,
		loreFor,
		pinLore,
		onpick,
		onclose
	}: {
		places: DistrictPlaces;
		focusWardId?: string; // a ward tapped on the map: highlighted and scrolled to
		selectedPinId?: string;
		isGm: boolean;
		loreFor: (area: District) => LoreEntry | null;
		pinLore: (pin: MapPin) => LoreEntry | null;
		onpick: (pin: MapPin) => void;
		onclose: () => void;
	} = $props();

	const districtLore = $derived(loreFor(places.district));
	const count = $derived(places.wards.reduce((n, w) => n + w.places.length, 0) + places.elsewhere.length);

	// Bring a tapped ward into view.
	$effect(() => {
		if (!focusWardId) return;
		document.getElementById(`ward-${focusWardId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});
</script>

{#snippet place(pin: MapPin)}
	{@const lore = pinLore(pin)}
	<li>
		<button type="button" class="place" aria-pressed={pin.id === selectedPinId} onclick={() => onpick(pin)}>
			<span class="cat">{PIN_CATEGORY_LABELS[pin.category]}</span>
			<span class="name">{pin.label}</span>
			{#if isGm && !pin.visible}<span class="hidden">GM ONLY</span>{/if}
			{#if lore?.summary}<span class="summary">{lore.summary}</span>{/if}
		</button>
		{#if lore}<a class="read" href="/lore/{lore.slug}">LORE →</a>{/if}
	</li>
{/snippet}

<section class="menu" aria-label="{places.district.name} district">
	<Panel title="DISTRICT">
		<div class="head">
			<h2>{places.district.name}</h2>
			<button type="button" class="close" aria-label="Close district menu" onclick={onclose}>×</button>
		</div>
		{#if districtLore?.summary}<p class="dim">{districtLore.summary}</p>{/if}
		{#if districtLore}<a class="read" href="/lore/{districtLore.slug}">READ LORE →</a>{/if}
		<p class="dim small">
			{places.wards.length} {places.wards.length === 1 ? 'ward' : 'wards'} · {count}
			{count === 1 ? 'place' : 'places'}{isGm ? '' : ' revealed'}
		</p>

		{#each places.wards as { ward, places: inWard } (ward.id)}
			{@const wardLore = loreFor(ward)}
			<div class="ward" id="ward-{ward.id}" class:focus={ward.id === focusWardId}>
				<h3>
					{ward.name}
					{#if wardLore}<a class="read small" href="/lore/{wardLore.slug}">LORE →</a>{/if}
				</h3>
				{#if inWard.length}
					<ul>{#each inWard as pin (pin.id)}{@render place(pin)}{/each}</ul>
				{:else}
					<p class="dim small">{isGm ? 'No places yet. Use + PIN and tap inside this ward.' : 'Nothing known here yet.'}</p>
				{/if}
			</div>
		{/each}

		{#if places.elsewhere.length || places.wards.length === 0}
			<div class="ward">
				<h3>{places.wards.length ? `Elsewhere in ${places.district.name}` : 'Places'}</h3>
				{#if places.elsewhere.length}
					<ul>{#each places.elsewhere as pin (pin.id)}{@render place(pin)}{/each}</ul>
				{:else}
					<p class="dim small">Nothing known here yet.</p>
				{/if}
			</div>
		{/if}
	</Panel>
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	h2 {
		margin: 0;
		color: var(--mint);
	}

	.close {
		min-width: 44px;
		min-height: 44px;
	}

	.ward {
		margin-top: 1rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--frame-dim);
	}

	.ward.focus h3 {
		color: var(--mint);
	}

	h3 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0 0 0.4rem;
		font-family: var(--f-label);
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--red);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}

	li {
		display: flex;
		align-items: stretch;
		gap: 0.35rem;
	}

	.place {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.5rem;
		min-height: 44px;
		text-align: left;
	}

	.place[aria-pressed='true'] {
		border-color: var(--red);
	}

	.cat,
	.hidden {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--label);
	}

	.hidden {
		color: var(--red-soft);
	}

	.name {
		color: var(--value);
	}

	.summary {
		flex-basis: 100%;
		color: var(--muted);
		font-size: 0.85rem;
	}

	.read {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--mint);
		white-space: nowrap;
	}

	.read.small {
		min-height: 0;
		font-size: 0.65rem;
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}
</style>
