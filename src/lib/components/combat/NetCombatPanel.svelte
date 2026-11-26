<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import NetSetup from './NetSetup.svelte';
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
	<NetSetup {encounter} {disabled} oncommand={perform} />
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
	<NetProgramStates {encounter} {disabled} oncommand={perform} />
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
	select {
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
</style>
