<script lang="ts">
	// The NET actions of one combatant (#101 turn console): the one the GM is
	// acting for, chosen in the queue. Grouped by what they do, with the check
	// modifiers tucked away. Every action is the same engine call as before.
	import NetProgramStates from './NetProgramStates.svelte';
	import { PROGRAMS } from '#lib/rulesets/red/programs.ts';
	import {
		netAttack,
		encounterIce,
		slideIce,
		jackRunner,
		enterRunner,
		meatNetAction,
		type NetOutcome
	} from '#lib/rulesets/red/net-combat.ts';
	import type { Encounter } from '#lib/combat/encounter.ts';

	let {
		encounter,
		actorId,
		disabled,
		onchange
	}: {
		encounter: Encounter;
		actorId: string;
		disabled: boolean;
		onchange: (next: Encounter) => unknown | Promise<unknown>;
	} = $props();

	let targetId = $state('');
	let weapon = $state('zap');
	let targetProgram = $state('');
	let attackModifier = $state(0);
	let defenseModifier = $state(0);
	let notice = $state('');
	let error = $state('');
	const modifiers = () => ({ attack: attackModifier ?? 0, defense: defenseModifier ?? 0 });

	const participants = $derived(encounter.combatants.filter((c) => c.net));
	const actor = $derived(participants.find((c) => c.id === actorId));
	const others = $derived(participants.filter((c) => c.id !== actorId));
	const target = $derived(others.find((c) => c.id === targetId));
	const attackers = $derived(
		actor?.net?.kind === 'runner'
			? actor.net.programs.filter((p) => PROGRAMS.find((d) => d.id === p.defId)?.category === 'Attacker')
			: []
	);
	const programName = (defId: string) => PROGRAMS.find((d) => d.id === defId)?.name ?? defId;

	// A different combatant starts with a clean slate.
	let lastActor = '';
	$effect(() => {
		if (actorId === lastActor) return;
		lastActor = actorId;
		targetId = '';
		weapon = 'zap';
		targetProgram = '';
		attackModifier = 0;
		defenseModifier = 0;
		notice = '';
		error = '';
	});

	async function perform(fn: () => Encounter | NetOutcome) {
		error = '';
		notice = '';
		try {
			const result = fn();
			if ('encounter' in result) {
				const saved = await onchange(result.encounter);
				if (saved === false) throw Error('NET action was not saved. Review the refreshed fight before trying again.');
				notice = `${result.message}${result.attack && result.defense ? ` Attack ${result.attack.total} vs defense ${result.defense.total}.` : ''}`;
			} else {
				const saved = await onchange(result);
				if (saved === false) throw Error('NET change was not saved. Review the refreshed fight.');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not resolve NET action.';
		}
	}
</script>

{#if actor?.net}
	{@const net = actor.net}
	<div class="net" aria-label="NET actions for {actor.name}" role="group">
		<p class="state">
			{net.kind === 'runner'
				? `Interface ${net.rank} · ${net.jackedIn ? 'JACKED IN' : 'JACKED OUT'}`
				: net.kind === 'ice'
					? 'Black ICE'
					: 'Demon'} · NET actions spent {net.spent}{net.meat ? ' · MEAT ACTION USED' : ''}
		</p>
		{#if error}<p role="alert" class="error">{error}</p>{/if}
		{#if notice}<p role="status" class="notice">{notice}</p>{/if}

		<fieldset {disabled}>
			<legend>ATTACK</legend>
			<div class="pair">
				<label
					>NET target
					<select bind:value={targetId} onchange={() => (targetProgram = '')}>
						<option value="">Choose target…</option>
						{#each others as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
					</select>
				</label>
				{#if net.kind === 'runner'}
					<label
						>Attack
						<select bind:value={weapon}>
							<option value="zap">Zap</option>
							{#each attackers as p (p.id)}<option value={p.id}>{programName(p.defId)} · {p.id.slice(0, 6)}</option>{/each}
						</select>
					</label>
				{/if}
			</div>
			{#if target?.net?.kind === 'runner'}
				<label
					>Target program (for anti-program attacks)
					<select bind:value={targetProgram}>
						<option value="">Runner’s brain</option>
						{#each target.net.programs.filter((p) => p.phase === 'active') as p (p.id)}<option value={p.id}
								>{programName(p.defId)} · {p.id.slice(0, 6)}</option
							>{/each}
					</select>
				</label>
			{/if}
			<div class="row">
				<button
					type="button"
					class="primary"
					disabled={!target}
					onclick={() =>
						perform(() => netAttack(encounter, actor.id, target!.id, weapon, targetProgram || null, undefined, modifiers()))}
					>RESOLVE NET ATTACK</button
				>
				{#if net.kind === 'ice'}
					<button
						type="button"
						disabled={target?.net?.kind !== 'runner'}
						onclick={() => perform(() => encounterIce(encounter, actor.id, target!.id, undefined, modifiers()))}
						>ENCOUNTER / SPEED CONTEST</button
					>
				{/if}
			</div>
			<details class="modifiers">
				<summary>CHECK MODIFIERS</summary>
				<p class="dim small">Runner wound penalties are automatic. Add injuries, circumstances or GM rulings here.</p>
				<div class="pair">
					<label>Attacking check modifier <input type="number" min="-100" max="100" bind:value={attackModifier} /></label>
					<label>Opposing check modifier <input type="number" min="-100" max="100" bind:value={defenseModifier} /></label>
				</div>
			</details>
		</fieldset>

		{#if net.kind === 'runner'}
			<fieldset {disabled}>
				<legend>MOVE IN THE NET</legend>
				<div class="row">
					<button
						type="button"
						disabled={target?.net?.kind !== 'ice'}
						onclick={() => perform(() => slideIce(encounter, actor.id, target!.id, undefined, modifiers()))}>SLIDE</button
					>
					<button type="button" onclick={() => perform(() => enterRunner(encounter, actor.id))}>JACK IN (NEW RUN)</button>
					<button type="button" onclick={() => perform(() => jackRunner(encounter, actor.id, true))}>SAFE JACK OUT</button>
					<button type="button" class="danger" onclick={() => perform(() => jackRunner(encounter, actor.id, false))}
						>UNSAFE JACK OUT</button
					>
				</div>
			</fieldset>
			<fieldset {disabled}>
				<legend>MEAT ACTION INSTEAD</legend>
				<div class="row">
					<button type="button" onclick={() => perform(() => meatNetAction(encounter, actor.id, 'extinguish'))}
						>EXTINGUISH (MEAT ACTION)</button
					>
					<button type="button" onclick={() => perform(() => meatNetAction(encounter, actor.id, 'restore'))}
						>RESTORE BACKUP (MEAT ACTION)</button
					>
					<button type="button" onclick={() => perform(() => meatNetAction(encounter, actor.id, 'meat'))}>USE MEAT ACTION</button>
				</div>
			</fieldset>
		{/if}
		{#if net.kind !== 'ice'}
			<fieldset {disabled}>
				<legend>CONTROL NODE</legend>
				<div class="row">
					<button type="button" onclick={() => perform(() => meatNetAction(encounter, actor.id, 'control'))}
						>OPERATE CONTROL NODE (NET ACTION)</button
					>
				</div>
			</fieldset>
		{/if}

		<NetProgramStates {encounter} {disabled} only={actor.id} oncommand={perform} />
		<p class="refs small">
			<a href="/rules/net#combat">NET combat rules →</a> · <a href="/rules/net#black-ice">Black ICE rules →</a>
		</p>
	</div>
{/if}

<style>
	.net {
		display: grid;
		gap: 0.6rem;
	}

	p {
		margin: 0;
	}

	.state {
		color: var(--label);
		font-size: 0.85rem;
	}

	fieldset {
		min-width: 0;
		border: 0;
		border-top: 1px solid var(--frame-dim);
		margin: 0;
		padding: 0.5rem 0 0;
		display: grid;
		gap: 0.5rem;
	}

	legend {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.14em;
		color: var(--muted);
		padding: 0 0.4rem 0 0;
	}

	label {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		font-size: 0.85rem;
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem;
	}

	input,
	select {
		min-width: 0;
		width: 100%;
	}

	button,
	input,
	select {
		min-height: 44px;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
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

	.modifiers summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--muted);
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

	.notice {
		color: var(--bright);
	}
</style>
