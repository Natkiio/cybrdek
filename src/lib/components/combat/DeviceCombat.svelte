<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import AddCombatant from '#lib/components/combat/AddCombatant.svelte';
	import CombatantCard from '#lib/components/combat/CombatantCard.svelte';
	import {
		addCombatants,
		damage,
		heal,
		makeNpcs,
		makePc,
		newEncounter,
		nextTurn,
		parseEncounter,
		previousTurn,
		removeCombatant,
		rollFor,
		setInitiative,
		setOut,
		startEncounter,
		type Combatant,
		type Encounter,
		type HitLocation,
		type NpcInput
	} from '#lib/combat/encounter.ts';
	import { rollDie } from '#lib/engine/dice.ts';
	import type { Character } from '#lib/engine/types.ts';
	import { getCharacter, listCharacters, saveCharacter } from '#lib/storage/characters.ts';

	const STORAGE_KEY = 'cybrdek:encounter';
	const d10 = () => rollDie(10);
	const newId = () => crypto.randomUUID();

	// $state.raw: the encounter is replaced whole by the rules functions, never mutated.
	let encounter = $state.raw<Encounter>(newEncounter());
	let characters = $state.raw<Character[]>([]);
	let loaded = $state(false);
	let confirmingEnd = $state(false);
	let saveError = $state('');

	const current = $derived(encounter.combatants.find((c) => c.id === encounter.currentId));
	const alreadyIn = $derived(
		new Set(encounter.combatants.flatMap((c) => (c.characterId ? [c.characterId] : [])))
	);

	onMount(async () => {
		try {
			encounter = parseEncounter(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
		} catch {
			encounter = newEncounter();
		}
		loaded = true;
		characters = await listCharacters();
	});

	function set(next: Encounter) {
		encounter = next;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			saveError = 'Could not save the fight on this device.';
		}
	}

	/** A saved character's HP and armor stay in step with their sheet. */
	async function writeBack(after: Encounter, id: string) {
		const combatant = after.combatants.find((c) => c.id === id);
		if (!combatant?.characterId) return;
		try {
			const character = await getCharacter(combatant.characterId);
			if (!character) return;
			await saveCharacter({
				...character,
				extra: { ...character.extra, currentHp: combatant.hp, gear: combatant.gear }
			});
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		}
	}

	function hit(c: Combatant, amount: number, location: HitLocation) {
		const next = damage(encounter, c.id, amount, location);
		set(next);
		void writeBack(next, c.id);
	}

	function mend(c: Combatant, amount: number) {
		const next = heal(encounter, c.id, amount);
		set(next);
		void writeBack(next, c.id);
	}

	function endFight() {
		set(newEncounter());
		confirmingEnd = false;
	}
</script>


<div class="head">
	<h1>COMBAT</h1>
	{#if encounter.started}<span class="round">ROUND {encounter.round}</span>{/if}
</div>

{#if saveError}<p class="error" role="alert">{saveError}</p>{/if}

{#if !loaded}
	<Panel><p class="dim">LOADING…</p></Panel>
{:else}
	{#if encounter.started}
		<div class="controls">
			<button type="button" onclick={() => set(previousTurn(encounter))}>← BACK</button>
			<button type="button" class="next" onclick={() => set(nextTurn(encounter))}>NEXT TURN →</button>
		</div>
		{#if current}
			<p class="up" aria-live="polite">Up now: <strong>{current.name}</strong> · 1 Move Action + 1 Action</p>
		{/if}
	{:else if encounter.combatants.length}
		<div class="controls">
			<button type="button" class="next" onclick={() => set(startEncounter(encounter, d10))}>START FIGHT</button>
		</div>
		<p class="dim small">Anyone without an initiative rolls REF + 1d10 when the fight starts. Ties roll again.</p>
	{/if}

	{#if encounter.combatants.length}
		<ul class="queue" aria-label="Initiative queue">
			{#each encounter.combatants as c (c.id)}
				<CombatantCard
					combatant={c}
					started={encounter.started}
					isCurrent={c.id === encounter.currentId}
					ondamage={(amount, location) => hit(c, amount, location)}
					onheal={(amount) => mend(c, amount)}
					onroll={() => set(rollFor(encounter, c.id, d10))}
					oninitiative={(value) => set(setInitiative(encounter, c.id, value))}
					onout={(out) => set(setOut(encounter, c.id, out))}
					onremove={() => set(removeCombatant(encounter, c.id))}
				/>
			{/each}
		</ul>
	{:else}
		<Panel><p class="dim">Nobody's fighting yet. Add characters and NPCs below.</p></Panel>
	{/if}

	<AddCombatant
		{characters}
		{alreadyIn}
		onaddnpc={(input: NpcInput, count: number) =>
			set(addCombatants(encounter, makeNpcs(newId, input, count), d10))}
		onaddpc={(character) => set(addCombatants(encounter, [makePc(newId(), character)], d10))}
	/>

	{#if encounter.combatants.length}
		<div class="end">
			{#if confirmingEnd}
				<button type="button" class="danger" onclick={endFight}>CONFIRM: END AND CLEAR</button>
				<button type="button" onclick={() => (confirmingEnd = false)}>KEEP FIGHTING</button>
			{:else}
				<button type="button" onclick={() => (confirmingEnd = true)}>END ENCOUNTER</button>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.round {
		font-family: var(--f-label);
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		color: var(--mint);
	}

	.controls {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.controls button,
	.end button {
		min-height: 48px;
	}

	.next {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.up {
		margin: 0 0 0.75rem;
		color: var(--muted);
	}

	.up strong {
		color: var(--red);
	}

	.queue {
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}

	.end {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.danger {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	.error {
		color: var(--red-soft);
	}
</style>
