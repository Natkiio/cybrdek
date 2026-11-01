<script lang="ts">
	import {
		ARMOR_TYPES,
		armorFromType,
		validateGear,
		WEAPON_TYPES,
		weaponFromType,
		type GearItem
	} from '#lib/rulesets/red/gear.ts';
	import { skills } from '#lib/rulesets/red/skills.ts';

	// `item` is the starting point (a fresh preset, or a copy of the item being edited).
	let {
		item,
		onsave,
		oncancel
	}: { item: GearItem; onsave: (item: GearItem) => void; oncancel: () => void } = $props();

	// A local copy, so CANCEL throws the edits away. $state.snapshot gives a plain object.
	// svelte-ignore state_referenced_locally
	let draft = $state<GearItem>($state.snapshot(item));
	const problems = $derived(validateGear(draft));
	const weaponSkills = skills.filter((s) =>
		['handgun', 'shoulder-arms', 'archery', 'heavy-weapons', 'autofire', 'melee-weapon', 'brawling', 'martial-arts'].includes(s.id)
	);

	function pickWeaponType(id: string) {
		const type = WEAPON_TYPES.find((t) => t.id === id);
		if (!type) return;
		const keepName = draft.name && !WEAPON_TYPES.some((t) => t.name === draft.name);
		const next = weaponFromType(type, draft.id, keepName ? draft.name : type.name);
		draft = { ...next, notes: draft.notes };
	}

	function pickArmorType(id: string) {
		const type = ARMOR_TYPES.find((t) => t.id === id);
		if (!type) return;
		draft = { ...armorFromType(type, draft.id, draft.location ?? 'body'), notes: draft.notes };
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		if (problems.length) return;
		onsave({ ...$state.snapshot(draft), name: draft.name.trim() });
	}
</script>

<form class="editor" onsubmit={save}>
	{#if draft.kind === 'weapon'}
		<label>
			<span>TYPE</span>
			<select value={draft.weaponType} onchange={(e) => pickWeaponType(e.currentTarget.value)}>
				{#each WEAPON_TYPES as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
			</select>
		</label>
	{:else if draft.kind === 'armor'}
		<label>
			<span>TYPE</span>
			<select
				value={ARMOR_TYPES.find((t) => t.name === draft.name)?.id ?? ''}
				onchange={(e) => pickArmorType(e.currentTarget.value)}
			>
				<option value="" disabled>custom</option>
				{#each ARMOR_TYPES as t (t.id)}<option value={t.id}>{t.name} (SP {t.sp})</option>{/each}
			</select>
		</label>
	{/if}

	<label class="wide">
		<span>NAME</span>
		<input bind:value={draft.name} maxlength="60" autocomplete="off" />
	</label>

	{#if draft.kind === 'weapon'}
		<label>
			<span>SKILL</span>
			<select bind:value={draft.skill}>
				{#each weaponSkills as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
			</select>
		</label>
		<label><span>DAMAGE</span><input bind:value={draft.damage} placeholder="3d6" /></label>
		<label><span>ROF</span><input type="number" min="1" max="10" bind:value={draft.rof} /></label>
		{#if draft.magazine !== undefined}
			<label><span>MAGAZINE</span><input type="number" min="1" max="200" bind:value={draft.magazine} /></label>
		{/if}
	{:else if draft.kind === 'armor'}
		<label>
			<span>LOCATION</span>
			<select bind:value={draft.location}>
				<option value="body">Body</option>
				<option value="head">Head</option>
			</select>
		</label>
		<label><span>SP</span><input type="number" min="0" max="30" bind:value={draft.sp} /></label>
		<label><span>PENALTY</span><input type="number" min="-10" max="0" bind:value={draft.penalty} /></label>
	{:else}
		<label><span>QUANTITY</span><input type="number" min="0" max="999" bind:value={draft.quantity} /></label>
	{/if}

	<label class="wide">
		<span>NOTES</span>
		<input bind:value={draft.notes} maxlength="200" autocomplete="off" />
	</label>

	{#if problems.length}
		<ul class="problems">{#each problems as p (p)}<li>! {p}</li>{/each}</ul>
	{/if}

	<div class="actions wide">
		<button type="button" onclick={oncancel}>CANCEL</button>
		<button type="submit" class="primary" disabled={problems.length > 0}>SAVE</button>
	</div>
</form>

<style>
	.editor {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.5rem;
		padding: 0.75rem;
		margin: 0.5rem 0;
		border: 1px solid var(--red-dim);
		background: var(--bg-2);
	}

	.wide {
		grid-column: 1 / -1;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	label span {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--muted);
	}

	input,
	select {
		width: 100%;
		min-height: 44px;
	}

	select {
		background: var(--bg-0);
		color: var(--value);
		border: 1px solid var(--frame-dim);
		font-family: var(--f-mono);
		padding: 0 0.5rem;
	}

	.problems {
		grid-column: 1 / -1;
		list-style: none;
		margin: 0;
		padding: 0;
		color: var(--red-soft);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.actions button {
		min-height: 44px;
		padding: 0 1rem;
	}

	.primary {
		background: var(--red);
		color: var(--ink-on-red);
		border-color: var(--red);
	}

	.primary:disabled {
		background: var(--bg-3);
		color: var(--faint);
		border-color: var(--frame-dim);
	}
</style>
