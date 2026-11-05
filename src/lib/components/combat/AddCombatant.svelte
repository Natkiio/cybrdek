<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import type { Character } from '#lib/engine/types.ts';
	import type { NpcInput } from '#lib/combat/encounter.ts';

	let {
		characters,
		alreadyIn,
		onaddnpc,
		onaddpc
	}: {
		characters: readonly Character[]; // saved on this device
		alreadyIn: ReadonlySet<string>; // character ids already in the fight
		onaddnpc: (input: NpcInput, count: number) => void;
		onaddpc: (character: Character) => void;
	} = $props();

	let name = $state('');
	let ref = $state<number | null>(6);
	let hp = $state<number | null>(30);
	let spHead = $state<number | null>(0);
	let spBody = $state<number | null>(0);
	let count = $state<number | null>(1);

	const whole = (n: number | null, min: number, max: number) =>
		n !== null && Number.isInteger(n) && n >= min && n <= max;
	const valid = $derived(
		name.trim().length > 0 && whole(ref, 0, 20) && whole(hp, 1, 200) && whole(spHead, 0, 30) && whole(spBody, 0, 30) && whole(count, 1, 20)
	);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!valid) return;
		onaddnpc({ name, ref: ref!, hp: hp!, spHead: spHead!, spBody: spBody! }, count!);
		name = '';
		count = 1;
	}

	const available = $derived(characters.filter((c) => !alreadyIn.has(c.id)));
</script>

<Panel title="ADD TO THE FIGHT">
	{#if available.length}
		<div class="pcs">
			{#each available as c (c.id)}
				<button type="button" onclick={() => onaddpc(c)}>+ {c.name}</button>
			{/each}
		</div>
	{/if}
	<form onsubmit={submit}>
		<label class="wide"><span>NPC NAME</span><input bind:value={name} maxlength="60" placeholder="e.g. Ganger" /></label>
		<label><span>REF</span><input type="number" inputmode="numeric" min="0" max="20" bind:value={ref} /></label>
		<label><span>HP</span><input type="number" inputmode="numeric" min="1" max="200" bind:value={hp} /></label>
		<label><span>SP HEAD</span><input type="number" inputmode="numeric" min="0" max="30" bind:value={spHead} /></label>
		<label><span>SP BODY</span><input type="number" inputmode="numeric" min="0" max="30" bind:value={spBody} /></label>
		<label><span>HOW MANY</span><input type="number" inputmode="numeric" min="1" max="20" bind:value={count} /></label>
		<button type="submit" class="add" disabled={!valid}>ADD NPC</button>
	</form>
</Panel>

<style>
	.pcs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}

	form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
		gap: 0.5rem;
		align-items: end;
	}

	.wide {
		grid-column: 1 / -1;
	}

	label {
		display: grid;
		gap: 0.3rem;
	}

	span {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	input {
		width: 100%;
		min-width: 0;
	}

	input,
	button {
		min-height: 44px;
	}

	.add {
		color: var(--mint);
		border-color: var(--mint-dim);
	}
</style>
