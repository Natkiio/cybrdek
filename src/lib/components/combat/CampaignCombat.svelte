<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import RollLog from '#lib/components/RollLog.svelte';
	import AddCombatant from './AddCombatant.svelte';
	import CombatantCard from './CombatantCard.svelte';
	import PlayerFight from './PlayerFight.svelte';
	import FightDamageOffers from './FightDamageOffers.svelte';
	import { encounterSession } from '#lib/combat/session.svelte.ts';
	import { newEncounter, addCombatants, makeNpcs, makePc, damage, heal, startEncounter,
		nextTurn, previousTurn, rollFor, setInitiative, setOut, removeCombatant,
		type Encounter } from '#lib/combat/encounter.ts';
	import { rollDie } from '#lib/engine/dice.ts';
	import type { PartyCharacter } from '#lib/combat/api.ts';

	let { campaignId, userId }: { campaignId: string; userId: string } = $props();
	// Parent keys this component by account and campaign: the session owns one scope.
	const session = untrack(() => encounterSession(campaignId, userId));
	const combat = session.state;
	let confirmingEnd = $state(false);
	const d10 = () => rollDie(10);
	const uuid = () => crypto.randomUUID();
	const managed = $derived(combat.view?.canManage ? combat.view.encounter : null);
	const available = $derived(combat.party.filter(p => !managed?.combatants.some(c => c.characterId === p.character.id && c.characterOwnerId === p.ownerId)));
	const current = $derived(managed?.combatants.find(c => c.id === managed.currentId));
	onMount(session.start);
	function edit(next: Encounter) { void session.save(next); }
	function addPc(p: PartyCharacter) {
		if (!managed) return;
		edit(addCombatants(managed, [{ ...makePc(uuid(), p.character), characterOwnerId: p.ownerId }], d10));
	}
	function markDead(id: string, dead: boolean) {
		if (!managed) return;
		const next = setOut(managed, id, dead);
		edit({ ...next, combatants: next.combatants.map(c => c.id === id ? { ...c, dead } : c) });
	}
	async function end() {
		if (!managed) return;
		await session.save(managed, true); confirmingEnd = false;
	}
</script>

<h1>COMBAT</h1>
<p class="dim">Campaign fight · the GM runs combat.</p>
{#if combat.error}<p class="error" role="alert">{combat.error}</p>{/if}
<button type="button" disabled={combat.busy} onclick={async () => { await session.refresh(); await session.party(); }}>REFRESH FIGHT</button>
{#if combat.loading}
	<Panel><p class="dim">LOADING…</p></Panel>
{:else if combat.view}
	{#if combat.view.ended}<p class="dim" role="status">ENCOUNTER ENDED · Final results are retained. Your character sheet has not been changed.</p>{/if}
	{#if !combat.view.canManage}
		<PlayerFight encounter={combat.view.encounter} />
	{:else if !combat.view.id || combat.view.ended}
		<Panel title="CAMPAIGN ENCOUNTER">
			<p class="dim">Create a fight for this campaign. Members will see a read-only view.</p>
			<button type="button" disabled={combat.busy} onclick={() => session.save(newEncounter(), false, true)}>NEW ENCOUNTER</button>
		</Panel>
	{:else if managed}
		{@const fight = managed}
		<!-- Disable the whole mutation surface while awaiting one authoritative save. -->
		<fieldset disabled={combat.busy}>
			{#if fight.started}
				<p>ROUND {fight.round}</p>
				<div class="actions">
					<button type="button" onclick={() => edit(previousTurn(fight))}>← BACK</button>
					<button type="button" onclick={() => edit(nextTurn(fight))}>NEXT TURN →</button>
				</div>
				{#if current}<p>Up now: <strong>{current.name}</strong></p>{/if}
			{:else if fight.combatants.length}
				<button type="button" onclick={() => edit(startEncounter(fight, d10))}>START FIGHT</button>
			{/if}
			<ul class="queue" aria-label="Initiative queue">
				{#each fight.combatants as c (c.id)}
					<CombatantCard combatant={c} started={fight.started} isCurrent={c.id === fight.currentId}
						ondamage={(amount, location) => edit(damage(fight, c.id, amount, location))}
						onheal={(amount) => edit(heal(fight, c.id, amount))}
						onroll={() => edit(rollFor(fight, c.id, d10))}
						oninitiative={(n) => edit(setInitiative(fight, c.id, n))}
						onout={(out) => edit(setOut(fight, c.id, out))}
						onremove={() => edit(removeCombatant(fight, c.id))} />
					<li class="death"><button type="button" onclick={() => markDead(c.id, !c.dead)}>{c.dead ? 'CLEAR DEATH' : 'MARK DEAD'}: {c.name}</button></li>
				{/each}
			</ul>
			<Panel title="CAMPAIGN CHARACTERS">
				<p class="dim">Only live characters assigned to this campaign are listed.</p>
				<div class="actions">{#each available as p (p.key)}<button type="button" onclick={() => addPc(p)}>+ {p.character.name}</button>{/each}</div>
			</Panel>
			<AddCombatant characters={[]} alreadyIn={new Set()} onaddpc={() => {}}
				onaddnpc={(input, count) => edit(addCombatants(fight, makeNpcs(uuid, input, count), d10))} />
			<div class="actions">
				{#if confirmingEnd}
					<button type="button" onclick={end}>CONFIRM: END ENCOUNTER</button>
					<button type="button" onclick={() => (confirmingEnd = false)}>KEEP FIGHTING</button>
				{:else}<button type="button" onclick={() => (confirmingEnd = true)}>END ENCOUNTER</button>{/if}
			</div>
		</fieldset>
		<p class="dim">Fight HP and armor are encounter snapshots. Owners choose whether to take fight damage onto their sheets after the encounter ends.</p>
	{/if}
	<FightDamageOffers {campaignId} {userId} fightVersion={`${combat.view.id}:${combat.view.revision}`} />
{/if}
<RollLog />

<style>
	fieldset { border: 0; padding: 0; margin: 1rem 0; min-width: 0; }
	.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.6rem 0; }
	button { min-height: 44px; }
	.queue { padding: 0; list-style: none; display: grid; gap: 0.35rem; }
	.death { margin-bottom: 0.5rem; }
	.dim { color: var(--muted); }
	.error { color: var(--red-soft); }
	strong { color: var(--value); }
</style>
