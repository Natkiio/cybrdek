<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import LoreSelect from '#lib/components/map/LoreSelect.svelte';
	import type { LoreEntry } from '#lib/lore/types.ts';
	import {
		PIN_CATEGORIES,
		PIN_CATEGORY_LABELS,
		PIN_LABEL_MAX,
		validatePin,
		type PinDraft
	} from '#lib/map/pins.ts';

	let {
		draft = $bindable(),
		isNew,
		entries,
		moving,
		busy,
		error,
		onsave,
		ondelete,
		onmove,
		oncancel
	}: {
		draft: PinDraft;
		isNew: boolean;
		entries: readonly LoreEntry[];
		moving: boolean;
		busy: boolean;
		error: string;
		onsave: () => void;
		ondelete: () => void;
		onmove: () => void;
		oncancel: () => void;
	} = $props();

	let confirmingDelete = $state(false);
	let tried = $state(false);
	const problems = $derived(validatePin(draft));
	const linked = $derived(entries.find((e) => e.id === draft.lore_entry_id));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		tried = true;
		if (problems.length === 0) onsave();
	}

	/** Name the pin after the chosen entry if it has no name yet. */
	function pickedEntry() {
		if (!draft.label.trim() && linked) draft.label = linked.title;
	}
</script>

<form onsubmit={submit}>
	<Panel title={isNew ? 'NEW PIN' : 'EDIT PIN'}>
		<label>
			<span>NAME</span>
			<input required maxlength={PIN_LABEL_MAX} bind:value={draft.label} placeholder="e.g. Topaz's Bar" />
		</label>
		<label>
			<span>KIND OF PLACE</span>
			<select bind:value={draft.category}>
				{#each PIN_CATEGORIES as c (c)}<option value={c}>{PIN_CATEGORY_LABELS[c]}</option>{/each}
			</select>
		</label>
		<div onchange={pickedEntry} role="presentation">
			<LoreSelect {entries} bind:value={draft.lore_entry_id} />
		</div>
		<label class="check">
			<input type="checkbox" bind:checked={draft.visible} />
			<span>VISIBLE TO PLAYERS</span>
		</label>
		<p class="dim">
			{#if !draft.visible}
				GM only. Players never receive this pin.
			{:else if linked && !linked.visible}
				Hidden from players until “{linked.title}” is shown to them.
			{:else}
				Players can see this pin.
			{/if}
		</p>
		<p class="dim">At x {Math.round(draft.x)}, y {Math.round(draft.y)}.
			<button type="button" class="link" onclick={onmove}>{moving ? 'Tap the map…' : 'MOVE'}</button>
		</p>

		{#if tried && problems.length}<ul class="error">{#each problems as p (p)}<li>{p}</li>{/each}</ul>{/if}
		{#if error}<p class="error" aria-live="polite">{error}</p>{/if}

		<div class="actions">
			<button type="submit" class="save" disabled={busy}>{busy ? 'SAVING…' : 'SAVE PIN'}</button>
			<button type="button" onclick={oncancel}>CANCEL</button>
			{#if !isNew}
				{#if confirmingDelete}
					<button type="button" class="danger" disabled={busy} onclick={ondelete}>CONFIRM DELETE</button>
				{:else}
					<button type="button" class="danger" onclick={() => (confirmingDelete = true)}>DELETE</button>
				{/if}
			{/if}
		</div>
	</Panel>
</form>

<style>
	label {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.75rem;
	}

	label > span {
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0 0;
	}

	select,
	input:not([type='checkbox']) {
		width: 100%;
		min-width: 0;
	}

	input,
	select,
	button {
		min-height: 44px;
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red-soft);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}

	.save {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.danger {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.link {
		min-height: 0;
		padding: 0 0.3rem;
		background: none;
		border: none;
		color: var(--mint);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
