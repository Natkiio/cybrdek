<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import SecurityReference from '#lib/components/net/SecurityReference.svelte';
	import { PROGRAMS } from '#lib/rulesets/red/programs.ts';
	import { BLACK_ICE, DEMONS } from '#lib/rulesets/red/net-security.ts';
	import {
		runnerNet,
		securityCombatant,
		netAttack,
		encounterIce,
		slideIce,
		programState,
		jackRunner,
		enterRunner,
		meatNetAction,
		type NetOutcome
	} from '#lib/rulesets/red/net-combat.ts';
	import { addCombatants, makeNpc, type Encounter } from '#lib/combat/encounter.ts';
	import { rollDie } from '#lib/engine/dice.ts';
	let {
		encounter,
		disabled,
		onchange
	}: {
		encounter: Encounter;
		disabled: boolean;
		onchange: (next: Encounter) => unknown | Promise<unknown>;
	} = $props();
	let actorId = $state('');
	let targetId = $state('');
	let weapon = $state('zap');
	let targetProgram = $state('');
	let securityKind = $state<'ice' | 'demon'>('ice');
	let securityId = $state('hellhound');
	let runnerId = $state('');
	let deckId = $state('');
	let rank = $state(4);
	let npcName = $state('Enemy Netrunner');
	let npcHp = $state(40);
	let npcRef = $state(6);
	let npcPrograms = $state(['sword', 'armor']);
	let attackModifier = $state(0);
	let defenseModifier = $state(0);
	const modifiers = () => ({ attack: attackModifier ?? 0, defense: defenseModifier ?? 0 });
	let notice = $state('');
	let error = $state('');
	const participants = $derived(encounter.combatants.filter((c) => c.net));
	const actor = $derived(
		participants.find((c) => c.id === actorId) ??
			participants.find((c) => c.id === encounter.currentId) ??
			participants[0]
	);
	const target = $derived(participants.find((c) => c.id === targetId && c.id !== actor?.id));
	const candidates = $derived(
		encounter.combatants.filter((c) => !c.net && c.gear.some((g) => g.cyberdeck))
	);
	const runner = $derived(candidates.find((c) => c.id === runnerId) ?? candidates[0]);
	const decks = $derived(runner?.gear.filter((g) => g.cyberdeck) ?? []);
	const selectedDeck = $derived(decks.find((g) => g.id === deckId) ?? decks[0]);
	async function perform(fn: () => Encounter | NetOutcome) {
		error = '';
		notice = '';
		try {
			const result = fn();
			if ('encounter' in result) {
				const saved = await onchange(result.encounter);
				if (saved === false)
					throw Error('NET action was not saved. Review the refreshed fight before trying again.');
				notice = `${result.message}${result.attack && result.defense ? ` Attack ${result.attack.total} vs defense ${result.defense.total}.` : ''}`;
			} else {
				const saved = await onchange(result);
				if (saved === false) throw Error('NET change was not saved. Review the refreshed fight.');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not resolve NET action.';
		}
	}
	function attach() {
		if (!runner || !selectedDeck) return;
		void perform(() => ({
			...encounter,
			combatants: encounter.combatants.map((c) =>
				c.id === runner.id ? { ...c, net: runnerNet(selectedDeck, rank) } : c
			)
		}));
	}
	function addNpc() {
		void perform(() => {
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

<Panel title="NET COMBAT">
	<p>
		<a href="/rules/net#combat">NET combat reference →</a> ·
		<a href="/rules/net#black-ice">Black ICE reference →</a>
	</p>
	<p class="dim">
		GM encounter snapshots. NET and Meatspace share the initiative queue. Program/deck state stays
		in this fight; sheet HP carry-over uses the existing owner acceptance flow.
	</p>
	<p class="dim">
		Track floor access in the Architecture. Conditions affecting meatspace checks, blocked-movement
		durations, Control Node devices and their damage are adjudicated by the GM below.
	</p>
	{#if error}<p role="alert" class="error">{error}</p>{/if}
	{#if notice}<p role="status">{notice}</p>{/if}
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
					perform(() =>
						addCombatants(
							encounter,
							[securityCombatant(crypto.randomUUID(), securityKind, securityId)],
							() => rollDie(10)
						)
					)}>ADD NET SECURITY</button
			>
		</fieldset>
	</details>
	{#if participants.length}
		<fieldset {disabled}>
			<legend>NET ACTION</legend>
			<p class="dim">
				Runner wound penalties are automatic. Enter other check modifiers here (injuries,
				circumstances, GM rulings).
			</p>
			<label
				>Attacking check modifier <input
					type="number"
					min="-100"
					max="100"
					bind:value={attackModifier}
				/></label
			>
			<label
				>Opposing check modifier <input
					type="number"
					min="-100"
					max="100"
					bind:value={defenseModifier}
				/></label
			>
			<label
				>NET actor <select
					value={actor?.id ?? ''}
					onchange={(e) => {
						actorId = e.currentTarget.value;
						attackModifier = 0;
						defenseModifier = 0;
						weapon = 'zap';
						targetProgram = '';
					}}
					>{#each participants as c}<option value={c.id}>{c.name}</option>{/each}</select
				></label
			>
			{#if actor?.net}
				<p>
					{actor.net.kind} · {actor.net.kind === 'runner'
						? `Interface ${actor.net.rank} · ${actor.net.jackedIn ? 'JACKED IN' : 'JACKED OUT'}`
						: actor.net.defId} · NET actions spent {actor.net.spent}{actor.net.meat
						? ' · MEAT ACTION USED'
						: ''}
				</p>
				<label
					>NET target <select bind:value={targetId} onchange={() => (targetProgram = '')}
						><option value="">Choose target…</option
						>{#each participants.filter((c) => c.id !== actor!.id) as c}<option value={c.id}
								>{c.name}</option
							>{/each}</select
					></label
				>
				{#if actor.net.kind === 'runner'}
					<label
						>Attack <select bind:value={weapon}
							><option value="zap">Zap</option
							>{#each actor.net.programs.filter((p) => PROGRAMS.find((d) => d.id === p.defId)?.category === 'Attacker') as p}<option
									value={p.id}
									>{PROGRAMS.find((d) => d.id === p.defId)?.name} · {p.id.slice(0, 6)}</option
								>{/each}</select
						></label
					>
				{/if}
				{#if target?.net?.kind === 'runner'}<label
						>Target program (for anti-program attacks) <select bind:value={targetProgram}
							><option value="">Runner’s brain</option
							>{#each target.net.programs.filter((p) => p.phase === 'active') as p}<option
									value={p.id}>{p.defId} · {p.id.slice(0, 6)}</option
								>{/each}</select
						></label
					>{/if}
				<div class="actions">
					<button
						type="button"
						disabled={!target}
						onclick={() =>
							perform(() =>
								netAttack(
									encounter,
									actor!.id,
									target!.id,
									weapon,
									targetProgram || null,
									undefined,
									modifiers()
								)
							)}>RESOLVE NET ATTACK</button
					>
					{#if actor.net.kind === 'ice'}<button
							type="button"
							disabled={target?.net?.kind !== 'runner'}
							onclick={() =>
								perform(() =>
									encounterIce(encounter, actor!.id, target!.id, undefined, modifiers())
								)}>ENCOUNTER / SPEED CONTEST</button
						>{/if}
					{#if actor.net.kind === 'runner'}
						<button
							type="button"
							disabled={target?.net?.kind !== 'ice'}
							onclick={() =>
								perform(() => slideIce(encounter, actor!.id, target!.id, undefined, modifiers()))}
							>SLIDE</button
						>
						<button type="button" onclick={() => perform(() => enterRunner(encounter, actor!.id))}
							>JACK IN (NEW RUN)</button
						>
						<button
							type="button"
							onclick={() => perform(() => jackRunner(encounter, actor!.id, true))}
							>SAFE JACK OUT</button
						>
						<button
							type="button"
							onclick={() => perform(() => jackRunner(encounter, actor!.id, false))}
							>UNSAFE JACK OUT</button
						>
						<button
							type="button"
							onclick={() => perform(() => meatNetAction(encounter, actor!.id, 'extinguish'))}
							>EXTINGUISH (MEAT ACTION)</button
						>
						<button
							type="button"
							onclick={() => perform(() => meatNetAction(encounter, actor!.id, 'restore'))}
							>RESTORE BACKUP (MEAT ACTION)</button
						>
						<button
							type="button"
							onclick={() => perform(() => meatNetAction(encounter, actor!.id, 'meat'))}
							>USE MEAT ACTION</button
						>
					{/if}
					{#if actor.net.kind !== 'ice'}<button
							type="button"
							onclick={() => perform(() => meatNetAction(encounter, actor!.id, 'control'))}
							>OPERATE CONTROL NODE (NET ACTION)</button
						>{/if}
				</div>
			{/if}
		</fieldset>
	{/if}
	{#each participants as c (c.id)}
		<section aria-label={`NET state ${c.name}`}>
			<h3>{c.name} · {c.net?.kind === 'runner' ? `${c.hp} HP` : `${c.hp} REZ`}</h3>
			{#if c.net?.kind !== 'runner'}<SecurityReference
					type={c.net?.kind === 'ice' ? 'black-ice' : 'demon'}
					refId={c.net?.defId ?? null}
				/>{/if}
			{#if c.net?.kind === 'runner'}
				{#if c.net.fire}<p class="error">ON FIRE · 2 HP at end of Turn until extinguished.</p>{/if}
				{#if c.net.glue}<p class="error">
						Movement / safe Jack Out blocked. GM clears at the stated effect expiry.
					</p>
					<button
						type="button"
						{disabled}
						onclick={() =>
							perform(() => ({
								...encounter,
								combatants: encounter.combatants.map((x) =>
									x.id === c.id ? { ...x, net: { ...x.net!, glue: 0 } } : x
								)
							}))}>CLEAR HOLD</button
					>{/if}
				{#each c.net.conditions as condition, i}<p>
						{condition}
						<button
							type="button"
							{disabled}
							onclick={() =>
								perform(() => ({
									...encounter,
									combatants: encounter.combatants.map((x) =>
										x.id === c.id
											? {
													...x,
													net: {
														...x.net!,
														conditions: x.net!.conditions.filter((_, n) => n !== i)
													}
												}
											: x
									)
								}))}>CLEAR CONDITION</button
						>
					</p>{/each}
				<ul>
					{#each c.net.programs as p (p.id)}
						<li>
							{PROGRAMS.find((d) => d.id === p.defId)?.name} · {p.id.slice(0, 6)} · {p.rez} REZ · {p.phase}
							{#if PROGRAMS.find((d) => d.id === p.defId)?.category !== 'Attacker'}
								<button
									type="button"
									disabled={disabled || !['inactive', 'active', 'derezzed'].includes(p.phase)}
									onclick={() =>
										perform(() => programState(encounter, c.id, p.id, p.phase === 'inactive'))}
									>{p.phase === 'inactive' ? 'ACTIVATE' : 'DEACTIVATE'}</button
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</Panel>

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
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.dim {
		color: var(--muted);
	}
	.error {
		color: var(--red-soft);
	}
	li,
	section {
		overflow-wrap: anywhere;
	}
	h3 {
		color: var(--value);
	}
	ul {
		padding-left: 1rem;
	}
</style>
