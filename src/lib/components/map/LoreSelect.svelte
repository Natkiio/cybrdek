<script lang="ts">
	import { LORE_TYPE_LABELS, type LoreEntry } from '#lib/lore/types.ts';

	// Pick a lore entry (or none). The GM sees every entry; hidden ones are marked.
	let {
		entries,
		value = $bindable(),
		label = 'LORE ENTRY'
	}: { entries: readonly LoreEntry[]; value: string | null; label?: string } = $props();
</script>

<label>
	<span>{label}</span>
	<select bind:value>
		<option value={null}>None</option>
		{#each entries as e (e.id)}
			<option value={e.id}>{e.title} · {LORE_TYPE_LABELS[e.type]}{e.visible ? '' : ' (GM only)'}</option>
		{/each}
	</select>
</label>

<style>
	label {
		display: grid;
		gap: 0.35rem;
	}

	span {
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	select {
		width: 100%;
		min-width: 0;
		min-height: 44px;
	}
</style>
