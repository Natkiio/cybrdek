<script lang="ts">
	import { PROGRAMS } from '#lib/rulesets/red/programs.ts';
	import { BLACK_ICE, DEMONS } from '#lib/rulesets/red/net-security.ts';
	import { runnerNet, securityCombatant } from '#lib/rulesets/red/net-combat.ts';
	import { addCombatants, makeNpc, type Encounter } from '#lib/combat/encounter.ts';
	import { rollDie } from '#lib/engine/dice.ts';
	let {
		encounter,
		disabled,
		oncommand
	}: {
		encounter: Encounter;
		disabled: boolean;
		oncommand: (fn: () => Encounter) => void | Promise<void>;
	} = $props();
	let securityKind = $state<'ice' | 'demon'>('ice');
	let securityId = $state('hellhound');
	let runnerId = $state('');
	let deckId = $state('');
	let rank = $state(4);
	let npcName = $state('Enemy Netrunner');
	let npcHp = $state(40);
	let npcRef = $state(6);
	let npcPrograms = $state(['sword', 'armor']);
	const candidates = $derived(
		encounter.combatants.filter((c) => !c.net && c.gear.some((g) => g.cyberdeck))
	);
	const runner = $derived(candidates.find((c) => c.id === runnerId) ?? candidates[0]);
	const decks = $derived(runner?.gear.filter((g) => g.cyberdeck) ?? []);
	const selectedDeck = $derived(decks.find((g) => g.id === deckId) ?? decks[0]);
	function attach() {
		if (!runner || !selectedDeck) return;
		void oncommand(() => ({
			...encounter,
			combatants: encounter.combatants.map((c) =>
				c.id === runner.id ? { ...c, net: runnerNet(selectedDeck, rank) } : c
			)
		}));
	}
	function addNpc() {
		void oncommand(() => {
			const c = makeNpc(crypto.randomUUID(), {
				name: npcName,
				hp: npcHp,
				ref: npcRef,
				spHead: 0,
				spBody: 0
			});
			const deck = {
				id: crypto.randomUUID(),
				name: 'NPC deck',
				kind: 'item' as const,
				cyberdeck: {
					quality: 'standard' as const,
					hardware: [],
					programs: npcPrograms.map((defId) => ({ id: crypto.randomUUID(), defId, loaded: true }))
				}
			};
			c.gear = [deck];
			c.net = runnerNet(deck, rank);
			return addCombatants(encounter, [c], () => rollDie(10));
		});
	}
</script>

<details open={!encounter.started}>
	<summary>SETUP NET PARTICIPANTS</summary>
	<fieldset {disabled}>
		<legend>SETUP</legend>
		<label>Interface rank <input type="number" min="1" max="10" bind:value={rank} /></label>
		{#if runner && selectedDeck}
			<label
				>Runner snapshot <select bind:value={runnerId}
					>{#each candidates as c}<option value={c.id}>{c.name}</option>{/each}</select
				></label
			>
			<label
				>Deck snapshot <select bind:value={deckId}
					>{#each decks as d}<option value={d.id}>{d.name}</option>{/each}</select
				></label
			>
			<button type="button" onclick={attach}>ATTACH RUNNER NET SNAPSHOT</button>
		{/if}
		<details>
			<summary>ADD NPC NETRUNNER</summary>
			<label>NPC runner name <input maxlength="100" bind:value={npcName} /></label>
			<label>NPC runner HP <input type="number" min="1" max="10000" bind:value={npcHp} /></label>
			<label>NPC runner REF <input type="number" min="0" max="100" bind:value={npcRef} /></label>
			<label
				>NPC programs (up to 7 slots) <select multiple bind:value={npcPrograms}
					>{#each PROGRAMS as p}<option value={p.id}>{p.name}</option>{/each}</select
				></label
			>
			<button
				type="button"
				disabled={!npcName.trim() || !npcHp || npcPrograms.length > 7}
				onclick={addNpc}>ADD NPC RUNNER</button
			>
		</details>
		<label
			>Security kind <select
				bind:value={securityKind}
				onchange={() => (securityId = securityKind === 'ice' ? 'hellhound' : 'imp')}
				><option value="ice">Black ICE</option><option value="demon">Demon</option></select
			></label
		>
		<label
			>Security <select bind:value={securityId}
				>{#each securityKind === 'ice' ? BLACK_ICE : DEMONS as d}<option value={d.id}
						>{d.name}</option
					>{/each}</select
			></label
		>
		<button
			type="button"
			onclick={() =>
				oncommand(() =>
					addCombatants(
						encounter,
						[securityCombatant(crypto.randomUUID(), securityKind, securityId)],
						() => rollDie(10)
					)
				)}>ADD NET SECURITY</button
		>
	</fieldset>
</details>

<style>
	fieldset {
		min-width: 0;
		border: 1px solid var(--frame-dim);
		margin: 0.8rem 0;
	}
	label {
		display: grid;
		gap: 0.3rem;
		margin: 0.5rem 0;
	}
	input,
	select {
		min-width: 0;
		width: 100%;
	}
	button,
	input,
	select,
	summary {
		min-height: 44px;
	}
</style>
