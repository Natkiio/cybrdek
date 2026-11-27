<script lang="ts">
	import { untrack } from 'svelte';
	import { architectureProblem, newFloor, type Architecture } from '#lib/net/architecture.ts';
	import FloorIndex from './FloorIndex.svelte';
	import FloorEditor from './FloorEditor.svelte';
	let {
		initial,
		busy,
		onsave,
		oncancel
	}: {
		initial: Architecture;
		busy: boolean;
		onsave: (draft: Architecture) => Promise<void>;
		oncancel: () => void;
	} = $props();
	// Snapshot belongs to this editor; incoming refreshes cannot silently rebase it.
	let draft = $state<Architecture>(untrack(() => structuredClone($state.snapshot(initial))));
	const problem = $derived(architectureProblem(draft));
	let removing = $state('');
	const floorPrefix = $props.id();
	function move(index: number, direction: number) {
		const floors = [...draft.floors];
		[floors[index], floors[index + direction]] = [floors[index + direction], floors[index]];
		draft.floors = floors;
	}
</script>

<form
	onsubmit={async (e) => {
		e.preventDefault();
		if (!problem) await onsave($state.snapshot(draft));
	}}
>
	<fieldset disabled={busy}>
		<legend>ARCHITECTURE EDITOR</legend>
		<p>
			Names and Player text on revealed floors are shared. DVs and GM notes always stay private.
			Reveal changes take effect when you save.
		</p>
		<label>Architecture name <input required maxlength="100" bind:value={draft.name} /></label>
		<label
			>Architecture GM notes <textarea maxlength="4000" bind:value={draft.gmNotes}
			></textarea></label
		>
		<div class="editor-floors">
			<FloorIndex floors={draft.floors} prefix={floorPrefix} name={draft.name} editing />
			<div class="floor-forms">
				{#each draft.floors as floor, i (floor.id)}
					<section class="floor" id="{floorPrefix}-{floor.id}" tabindex="-1" aria-label={`Edit floor ${i + 1}`}>
						<h3>FLOOR {i + 1}</h3>
						<FloorEditor bind:floor={draft.floors[i]} />
						<div class="actions">
							<button type="button" disabled={i === 0} onclick={() => move(i, -1)}>MOVE UP</button>
							<button type="button" disabled={i === draft.floors.length - 1} onclick={() => move(i, 1)}
								>MOVE DOWN</button
							>
							{#if removing === floor.id}
								<button
									type="button"
									onclick={() => {
										draft.floors = draft.floors.filter((f) => f.id !== floor.id);
										removing = '';
									}}>CONFIRM REMOVE FLOOR</button
								>
								<button type="button" onclick={() => (removing = '')}>KEEP FLOOR</button>
							{:else}<button type="button" onclick={() => (removing = floor.id)}>REMOVE FLOOR</button
								>{/if}
						</div>
					</section>
				{/each}
			</div>
		</div>
		<div class="actions">
			<button
				type="button"
				disabled={draft.floors.length >= 100}
				onclick={() =>
					(draft.floors = [
						...draft.floors,
						newFloor(crypto.randomUUID(), `Floor ${draft.floors.length + 1}`)
					])}>ADD FLOOR</button
			>
			<button type="submit" disabled={!!problem}>SAVE ARCHITECTURE</button>
			<button type="button" onclick={oncancel}>CANCEL EDIT</button>
		</div>
		{#if problem}<p role="status">{problem}</p>{/if}
	</fieldset>
</form>

<style>
	.editor-floors { display: grid; align-items: start; gap: 0 1.5rem; }
	.floor-forms { min-width: 0; }
	.floor:focus { outline: 2px solid var(--bright); outline-offset: 2px; }
	@media (min-width: 1000px) { .editor-floors:has(> :global(nav)) { grid-template-columns: 13rem minmax(0, 1fr); } }

	fieldset {
		min-width: 0;
		border: 1px solid var(--frame-dim);
		padding: 0.75rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		margin: 0.6rem 0;
	}
	input,
	textarea {
		width: 100%;
		min-width: 0;
	}
	input,
	button {
		min-height: 44px;
	}
	textarea {
		min-height: 80px;
	}
	.floor {
		margin: 0.65rem 0;
		padding-top: 0.65rem;
		scroll-margin-top: calc(var(--net-header-height, 4rem) + 1rem);
		border-top: 1px solid var(--frame-dim);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	h3,
	legend {
		color: var(--label);
	}
</style>
