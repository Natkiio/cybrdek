<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import LoreSelect from '#lib/components/map/LoreSelect.svelte';
	import type { LoreEntry } from '#lib/lore/types.ts';
	import type { District } from '#lib/map/districts.ts';
	import type { DistrictOverride } from '#lib/map/pins.ts';

	// GM: rename a traced district or point it at a different lore entry.
	let {
		district,
		override,
		entries,
		busy,
		error,
		onsave
	}: {
		district: District;
		override: DistrictOverride | undefined;
		entries: readonly LoreEntry[];
		busy: boolean;
		error: string;
		onsave: (override: DistrictOverride) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(override?.name ?? '');
	// svelte-ignore state_referenced_locally
	let loreId = $state<string | null>(override?.lore_entry_id ?? null);

	const defaultEntry = $derived(entries.find((e) => e.slug === district.loreSlug));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		onsave({ district_id: district.id, name: name.trim() || null, lore_entry_id: loreId });
	}
</script>

<form onsubmit={submit}>
	<Panel title="GM · DISTRICT">
		<label>
			<span>NAME ON THE MAP</span>
			<input maxlength="80" bind:value={name} placeholder={district.name} />
		</label>
		<LoreSelect {entries} bind:value={loreId} label="LORE ENTRY (blank = by name)" />
		<p class="dim">
			{#if loreId}
				Links to the chosen entry.
			{:else if defaultEntry}
				Links to “{defaultEntry.title}” because its title matches.
			{:else}
				No entry called “{district.name}” yet. Write one in LORE, or pick one here.
			{/if}
		</p>
		{#if error}<p class="error" aria-live="polite">{error}</p>{/if}
		<button type="submit" class="save" disabled={busy}>{busy ? 'SAVING…' : 'SAVE DISTRICT'}</button>
	</Panel>
</form>

<style>
	label {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.75rem;
	}

	span {
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	input {
		width: 100%;
		min-width: 0;
		min-height: 44px;
	}

	button {
		min-height: 44px;
		margin-top: 0.5rem;
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red-soft);
	}

	.save {
		color: var(--mint);
		border-color: var(--mint-dim);
	}
</style>
