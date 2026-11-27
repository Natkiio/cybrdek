<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import NetActions from './NetActions.svelte';
	import NetSetup from './NetSetup.svelte';
	import CombatantTools from './CombatantTools.svelte';
	import { beginNetTurn, endNetTurn } from '#lib/rulesets/red/net-combat.ts';
	import RollLog from '#lib/components/RollLog.svelte';
	import AddCombatant from './AddCombatant.svelte';
	import PlayerFight from './PlayerFight.svelte';
	import FightDamageOffers from './FightDamageOffers.svelte';
	import { encounterSession } from '#lib/combat/session.svelte.ts';
	import {
		newEncounter,
		addCombatants,
		makeNpcs,
		makePc,
		damage,
		heal,
		startEncounter,
		nextTurn,
		previousTurn,
		rollFor,
		setInitiative,
		setOut,
		removeCombatant,
		spOf,
		type Combatant,
		type Encounter
	} from '#lib/combat/encounter.ts';
	import { WOUND_LABELS, woundState } from '#lib/rulesets/red/wounds.ts';
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
	const available = $derived(
		combat.party.filter(
			(p) =>
				!managed?.combatants.some(
					(c) => c.characterId === p.character.id && c.characterOwnerId === p.ownerId
				)
		)
	);
	const current = $derived(managed?.combatants.find((c) => c.id === managed.currentId));
	onMount(session.start);
	function edit(next: Encounter) {
		return session.save(next);
	}
	function addPc(p: PartyCharacter) {
		if (!managed) return;
		edit(
			addCombatants(managed, [{ ...makePc(uuid(), p.character), characterOwnerId: p.ownerId }], d10)
		);
	}
	function markDead(id: string, dead: boolean) {
		if (!managed) return;
		const next = setOut(managed, id, dead);
		edit({ ...next, combatants: next.combatants.map((c) => (c.id === id ? { ...c, dead } : c)) });
	}
	// ---- the turn console (#101): act for whoever's Turn it is, or tap
	// someone in the queue to act on them instead.
	let selectedId = $state<string | null>(null);
	const selected = $derived(
		managed?.combatants.find((c) => c.id === selectedId) ?? current ?? managed?.combatants[0]
	);
	// A new Turn brings the panel back to whoever's up. Every save brings a new
	// fight object, so watch only the id: a derived value only changes when it does.
	// The Round counts too: with one combatant left, NEXT TURN keeps the same id.
	const turnKey = $derived(`${managed?.round ?? 0}:${managed?.currentId ?? ''}`);
	$effect(() => {
		void turnKey;
		untrack(() => (selectedId = null));
	});
	/** Move the Turn on or back; either way the panel goes to whoever's up. */
	function turn(next: Encounter) {
		selectedId = null;
		return edit(next);
	}
	// The console (and its sidebar roll log) only shows for a live fight the GM runs.
	const consoleOpen = $derived(
		!!(combat.view?.canManage && combat.view.id && !combat.view.ended && managed)
	);
	const isSecurity = (c: Combatant) => c.net?.kind === 'ice' || c.net?.kind === 'demon';
	function statusOf(c: Combatant) {
		if (isSecurity(c)) return c.hp === 0 ? 'Derezzed' : c.net?.kind === 'ice' ? 'Black ICE' : 'Demon';
		if (c.dead) return 'Dead';
		if (c.out) return 'Out of the fight';
		return `${WOUND_LABELS[woundState(c.hp, c.maxHp)]}${c.net?.kind === 'runner' ? (c.net.jackedIn ? ' · jacked in' : ' · jacked out') : ''}`;
	}

	// The turn bar sticks just below the site's own sticky header.
	let headerHeight = $state(0);
	onMount(() => {
		const bar = document.querySelector('header.bar');
		if (!bar) return;
		const measure = () => (headerHeight = bar.getBoundingClientRect().height);
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(bar);
		return () => watch.disconnect();
	});
	// Laptop: queue | the selected combatant | setup and the roll log.
	let wide = $state(false);
	onMount(() => {
		const query = matchMedia('(min-width: 1000px)');
		const sync = () => (wide = query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	// NET setup (decks, NPC runners, Black ICE) reports its own problems here.
	let setupError = $state('');
	async function setupCommand(fn: () => Encounter) {
		setupError = '';
		try {
			const saved = await edit(fn());
			if (saved === false) setupError = 'That change was not saved. Review the refreshed fight.';
		} catch (e) {
			setupError = e instanceof Error ? e.message : 'Could not change the fight.';
		}
	}

	async function end() {
		if (!managed) return;
		await session.save(managed, true);
		confirmingEnd = false;
	}
</script>

<h1>COMBAT</h1>
<p class="dim">Campaign fight · the GM runs combat.</p>
{#if combat.error}<p class="error" role="alert">{combat.error}</p>{/if}
<button
	type="button"
	disabled={combat.busy}
	onclick={async () => {
		await session.refresh();
		await session.party();
	}}>REFRESH FIGHT</button
>
{#if combat.loading}
	<Panel><p class="dim">LOADING…</p></Panel>
{:else if combat.view}
	{#if combat.view.ended}<p class="dim" role="status">
			ENCOUNTER ENDED · Final results are retained. Your character sheet has not been changed.
		</p>{/if}
	{#if !combat.view.canManage}
		<PlayerFight encounter={combat.view.encounter} />
	{:else if !combat.view.id || combat.view.ended}
		<Panel title="CAMPAIGN ENCOUNTER">
			<p class="dim">Create a fight for this campaign. Members will see a read-only view.</p>
			<button
				type="button"
				disabled={combat.busy}
				onclick={() => session.save(newEncounter(), false, true)}>NEW ENCOUNTER</button
			>
		</Panel>
	{:else if managed}
		{@const fight = managed}
		<!-- Disable the whole mutation surface while awaiting one authoritative save. -->
		<fieldset disabled={combat.busy} class="console-wrap wide-page">
			<div class="turnbar" style:--header-h="{headerHeight}px">
				{#if fight.started}
					<span class="round">ROUND {fight.round}</span>
					<span class="now">Up now: <strong>{current?.name ?? '—'}</strong></span>
					{#if wide}
						<button type="button" onclick={() => turn(previousTurn(fight))}>← BACK</button>
						<button type="button" class="primary" onclick={() => turn(beginNetTurn(nextTurn(endNetTurn(fight))))}
							>NEXT TURN →</button
						>
					{/if}
				{:else}
					<span class="now dim">Set up the fight, roll initiative, then start.</span>
					{#if fight.combatants.length}
						<button type="button" class="primary" onclick={() => edit(beginNetTurn(startEncounter(fight, d10)))}
							>START FIGHT</button
						>
					{/if}
				{/if}
			</div>

			<div class="console">
				<section class="queue-col" aria-label="Initiative">
					<h2 class="col-title">INITIATIVE</h2>
					{#if fight.combatants.length}
						<ul class="queue" aria-label="Initiative queue">
							{#each fight.combatants as c (c.id)}
								{@const sp = spOf(c)}
								<li>
									<button
										type="button"
										class="qrow"
										class:now={c.id === fight.currentId}
										class:security={isSecurity(c)}
										class:gone={c.out || c.dead || (isSecurity(c) && c.hp === 0)}
										aria-pressed={selected?.id === c.id}
										onclick={() => (selectedId = c.id)}
									>
										<span class="init">{c.initiative ?? '–'}</span>
										<span class="who">
											<span class="name">{c.name}{#if c.id === fight.currentId}<span class="turn">TURN</span>{/if}</span>
											<span class="meta">{statusOf(c)}</span>
										</span>
										<span class="vitals">
											<span class="hp">{c.hp}<small>/{c.maxHp}</small></span>
											<span class="meta">{isSecurity(c) ? 'REZ' : `SP ${sp.head}/${sp.body}`}</span>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="dim">Nobody yet. Add the party and some opposition in SET UP.</p>
					{/if}
				</section>

				<section class="actor-col">
					{#if selected}
						{@const upNow = selected.id === fight.currentId}
						<div class="actor" class:hot={upNow}>
							<Panel title={`${upNow ? 'UP NOW' : fight.started ? 'ACTING ON' : 'SELECTED'} · ${selected.name}`}>
								{#if !upNow && current}
									<button type="button" class="back" onclick={() => (selectedId = null)}>← BACK TO {current.name.toUpperCase()}</button>
								{/if}
								{#if selected.net}
									<NetActions encounter={fight} actorId={selected.id} disabled={combat.busy} onchange={edit} />
								{/if}
								<CombatantTools
									combatant={selected}
									started={fight.started}
									ondamage={isSecurity(selected) ? undefined : (amount, location) => edit(damage(fight, selected.id, amount, location))}
									onheal={isSecurity(selected) ? undefined : (amount) => edit(heal(fight, selected.id, amount))}
									onroll={() => edit(rollFor(fight, selected.id, d10))}
									oninitiative={(n) => edit(setInitiative(fight, selected.id, n))}
									onout={isSecurity(selected) ? undefined : (out) => edit(setOut(fight, selected.id, out))}
									ondead={isSecurity(selected) ? undefined : (dead) => markDead(selected.id, dead)}
									onremove={() => edit(removeCombatant(fight, selected.id))}
								/>
							</Panel>
						</div>
					{/if}
				</section>

				<section class="side-col">
					<details class="setup" open={wide || !fight.started}>
						<summary>SET UP THE FIGHT</summary>
						<Panel title="CAMPAIGN CHARACTERS">
							<p class="dim">Only live characters assigned to this campaign are listed.</p>
							<div class="actions">
								{#each available as p (p.key)}<button type="button" onclick={() => addPc(p)}>+ {p.character.name}</button>{/each}
							</div>
						</Panel>
						<AddCombatant
							characters={[]}
							alreadyIn={new Set()}
							onaddpc={() => {}}
							onaddnpc={(input, count) => edit(addCombatants(fight, makeNpcs(uuid, input, count), d10))}
						/>
						<Panel title="NET SETUP">
							{#if setupError}<p class="error" role="alert">{setupError}</p>{/if}
							<NetSetup encounter={fight} disabled={combat.busy} oncommand={setupCommand} />
						</Panel>
						<div class="actions">
							{#if confirmingEnd}
								<button type="button" class="danger" onclick={end}>CONFIRM: END ENCOUNTER</button>
								<button type="button" onclick={() => (confirmingEnd = false)}>KEEP FIGHTING</button>
							{:else}<button type="button" class="danger" onclick={() => (confirmingEnd = true)}>END ENCOUNTER</button>{/if}
						</div>
						<p class="dim small">
							Fight HP and armor are encounter snapshots. Owners choose whether to take fight damage onto their
							sheets after the encounter ends.
						</p>
					</details>
					{#if wide}<RollLog />{/if}
				</section>
			</div>

			{#if fight.started && !wide}
				<!-- NEXT TURN within thumb reach on a phone. -->
				<div class="bottombar">
					<button type="button" onclick={() => turn(previousTurn(fight))}>← BACK</button>
					<button type="button" class="primary" onclick={() => turn(beginNetTurn(nextTurn(endNetTurn(fight))))}>NEXT TURN →</button>
				</div>
			{/if}
		</fieldset>
	{/if}
	<FightDamageOffers
		{campaignId}
		{userId}
		fightVersion={`${combat.view.id}:${combat.view.revision}`}
	/>
{/if}
{#if !(consoleOpen && wide)}<RollLog />{/if}

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 1rem 0;
		min-width: 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.6rem 0;
	}

	button {
		min-height: 44px;
	}

	.primary {
		background: var(--red);
		color: var(--ink-on-red);
		border-color: var(--red);
	}

	.danger {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	/* The Round and who's up, pinned while the GM scrolls the panel. */
	.turnbar {
		position: sticky;
		top: var(--header-h, 0px);
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.6rem 0.75rem;
		margin-bottom: 1rem;
		background: var(--bg-1);
		border: 1px solid var(--frame-dim);
	}

	.round {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.14em;
		color: var(--muted);
	}

	.now {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.now strong {
		color: var(--red);
		font-weight: normal;
	}

	.console {
		display: grid;
		gap: 0 clamp(1rem, 2.5vw, 2rem);
		align-items: start;
	}

	.queue-col,
	.actor-col,
	.side-col {
		min-width: 0;
	}

	@media (min-width: 1000px) {
		.console {
			grid-template-columns: minmax(15rem, 1fr) minmax(0, 1.8fr) minmax(15rem, 1fr);
		}
	}

	.col-title {
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		color: var(--label);
		margin: 0 0 0.5rem;
	}

	.queue {
		padding: 0;
		margin: 0 0 1.5rem;
		list-style: none;
		display: grid;
		gap: 0.35rem;
	}

	.qrow {
		display: grid;
		grid-template-columns: 2.25rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 52px;
		padding: 0.4rem 0.6rem;
		text-align: left;
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--f-mono);
		background: var(--bg-2);
		border-left: 2px solid var(--frame);
	}

	.qrow[aria-pressed='true'] {
		border-color: var(--bright);
		background: var(--bg-3);
	}

	.qrow.now {
		border-left-color: var(--red);
		box-shadow: inset 3px 0 0 var(--red);
	}

	.qrow.gone {
		opacity: 0.55;
	}

	.init {
		font-size: 1.1rem;
		color: var(--muted);
		text-align: center;
	}

	.qrow.now .init {
		color: var(--red);
	}

	.who,
	.vitals {
		display: grid;
		min-width: 0;
	}

	.name {
		color: var(--bright);
		overflow-wrap: anywhere;
	}

	.qrow.security .name {
		color: var(--red-soft);
	}

	.turn {
		margin-left: 0.4rem;
		font-family: var(--f-label);
		font-size: 0.5rem;
		letter-spacing: 0.12em;
		color: var(--red);
	}

	.meta {
		font-size: 0.7rem;
		color: var(--muted);
	}

	.vitals {
		text-align: right;
		color: var(--value);
	}

	.vitals small {
		color: var(--muted);
	}

	.hp {
		white-space: nowrap;
	}

	/* Whoever's up is framed in red; someone else you're acting on, in white. */
	/* Long names (NPCs allow 60 characters) wrap inside the panel, never widen the page. */
	.actor {
		min-width: 0;
		overflow-wrap: anywhere;
		border: 1px solid var(--frame-dim);
		background: var(--bg-1);
		padding: 0.75rem 0.85rem 0.25rem;
		margin-bottom: 1.5rem;
	}

	.actor.hot {
		border-color: var(--red);
	}

	.actor :global(header) {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.back {
		margin-bottom: 0.6rem;
		max-width: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.setup > summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		color: var(--label);
		border-bottom: 1px solid var(--frame-dim);
		margin-bottom: 0.75rem;
	}

	.bottombar {
		position: sticky;
		bottom: 0;
		z-index: 5;
		display: flex;
		gap: 0.5rem;
		padding: 0.6rem 0 calc(0.6rem + env(safe-area-inset-bottom, 0px));
		background: var(--bg-0);
		border-top: 1px solid var(--frame-dim);
	}

	.bottombar button {
		flex: 1;
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

	strong {
		color: var(--value);
	}
</style>
