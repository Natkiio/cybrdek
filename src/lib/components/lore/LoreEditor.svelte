<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import { slugify, validateDraft } from '#lib/lore/links.ts';
	import {
		LORE_TYPE_LABELS,
		LORE_TYPES,
		SUMMARY_MAX,
		TITLE_MAX,
		type LoreDraft
	} from '#lib/lore/types.ts';

	let {
		initial,
		saving,
		error,
		onsave,
		oncancel
	}: {
		initial: LoreDraft;
		saving: boolean;
		error: string;
		onsave: (draft: LoreDraft) => void;
		oncancel: () => void;
	} = $props();

	// A local copy, so typing doesn't change the entry until SAVE.
	// svelte-ignore state_referenced_locally
	let draft = $state<LoreDraft>({ ...initial });
	const problems = $derived(validateDraft(draft));
	let tried = $state(false);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		tried = true;
		if (problems.length === 0) onsave($state.snapshot(draft));
	}
</script>

<form onsubmit={submit}>
	<Panel title="ENTRY">
		<label>
			<span>TITLE</span>
			<input required maxlength={TITLE_MAX} bind:value={draft.title} placeholder="e.g. Topaz's Bar" />
			{#if draft.title.trim()}<small class="dim">Link to it with [[{draft.title.trim()}]] · /lore/{slugify(draft.title)}</small>{/if}
		</label>
		<label>
			<span>TYPE</span>
			<select bind:value={draft.type}>
				{#each LORE_TYPES as type (type)}
					<option value={type}>{LORE_TYPE_LABELS[type]}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>SUMMARY <small class="dim">({draft.summary.length}/{SUMMARY_MAX})</small></span>
			<input maxlength={SUMMARY_MAX} bind:value={draft.summary} placeholder="One line shown in lists and on the map" />
		</label>
		<label>
			<span>BODY</span>
			<textarea rows="14" bind:value={draft.body}
				placeholder={'Markdown. **bold**, *italic*, ## headings, - lists.\nLink other entries with [[Entry name]] or [[Entry name|shown text]].'}
			></textarea>
		</label>
		<label class="visible">
			<input type="checkbox" bind:checked={draft.visible} />
			<span>VISIBLE TO PLAYERS</span>
		</label>
		<p class="dim">
			{draft.visible
				? 'Players can read this entry.'
				: 'GM only. Players never receive it, and links to it show as plain text.'}
		</p>
	</Panel>

	{#if tried && problems.length}
		<ul class="error">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
	{/if}
	{#if error}<p class="error" aria-live="polite">{error}</p>{/if}

	<div class="actions">
		<button type="submit" class="save" disabled={saving}>{saving ? 'SAVING…' : 'SAVE'}</button>
		<button type="button" onclick={oncancel}>CANCEL</button>
	</div>
</form>

<style>
	label {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.9rem;
	}

	label > span {
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	input,
	select,
	textarea,
	button {
		min-height: 44px;
	}

	input:not([type='checkbox']),
	select,
	textarea {
		width: 100%;
		min-width: 0;
	}

	textarea {
		font-family: var(--f-mono);
		resize: vertical;
	}

	.visible {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0;
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.save {
		color: var(--mint);
		border-color: var(--mint-dim);
	}
</style>
