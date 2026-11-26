<script lang="ts">
	// Being in the NET (#100, part 4): jack in and out, pick the campaign
	// Architecture you're running and the floor you're on, and keep the
	// Meatspace risks in view. Players only ever get floors the GM revealed
	// (the database redacts the rest), so the floor list is those floors.
	import { readArchitectures } from '#lib/net/api.ts';
	import NetStairs, { type Step } from './NetStairs.svelte';
	import type { PlayerEntry } from '#lib/net/architecture.ts';
	import { actionsLeft, chooseArchitecture, jackIn, jackOut, newTurn, meatspaceRisks, moveTo, moveToFloor, positionOf, type NetRun } from '#lib/rulesets/red/netrun.ts';

	interface RunnableFloor {
		id: string;
		label: string;
		entries: PlayerEntry[];
	}
	interface Runnable {
		id: string;
		name: string;
		floors: RunnableFloor[];
	}

	let {
		run,
		seesMeat,
		range,
		campaignId,
		signedIn,
		perTurn,
		onchange,
		onability
	}: {
		run: NetRun;
		seesMeat: boolean;
		range: string; // e.g. '6 m/yds', see accessRange
		campaignId: string;
		signedIn: boolean;
		perTurn: number; // NET Actions per Turn from Interface
		onchange: (next: NetRun) => void;
		onability: (abilityId: string) => void; // roll an Interface Ability from the floor you're on
	} = $props();

	let architectures = $state<Runnable[] | null>(null); // null: not loaded
	let loadError = $state('');
	let notice = $state('');
	let reload = $state(0);

	$effect(() => {
		void reload;
		const id = campaignId;
		architectures = null;
		loadError = '';
		if (!signedIn) return;
		let stale = false;
		void readArchitectures(id).then((view) => {
			if (stale) return;
			if ('error' in view) {
				loadError = view.error;
				return;
			}
			// The GM gets every floor; a runner uses only the revealed ones either way.
			architectures = view.architectures
				.map((a) => ({
					id: a.id,
					name: a.name,
					floors: a.floors
						.filter((f) => !('revealed' in f) || f.revealed)
						.map((f) => ({ id: f.id, label: f.label, entries: f.entries.map(({ id, type, name, refId, playerText }) => ({ id, type, name, refId, playerText })) }))
				}))
				.filter((a) => a.floors.length > 0);
		});
		return () => (stale = true);
	});

	const current = $derived(architectures?.find((a) => a.id === run.architectureId));
	// The stairs: the revealed floors of the chosen Architecture, or the floors
	// you've counted so far when you run without one.
	const steps: Step[] = $derived(
		current
			? current.floors.map((f) => ({ key: f.id, label: f.label, entries: f.entries }))
			: Array.from({ length: run.floor }, (_, i) => ({ key: `floor-${i + 1}`, label: `Floor ${i + 1}`, entries: null }))
	);
	const here = $derived(current ? Math.max(0, current.floors.findIndex((f) => f.id === run.floorId)) : run.floor - 1);
	const left = $derived(actionsLeft(run, perTurn));
	// While jacking out, the marker climbs back to the top before the run resets.
	let climbing = $state<number | null>(null);
	const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	function move(index: number) {
		onchange(current ? moveToFloor(run, current.floors[index]) : moveTo(run, index + 1));
	}

	function choose(id: string) {
		const a = architectures?.find((x) => x.id === id) ?? null;
		const next = chooseArchitecture(run, a);
		onchange(run.jackedIn && a?.floors[0] ? moveToFloor(next, a.floors[0]) : next);
	}

	function enter() {
		notice = '';
		const next = jackIn(run);
		onchange(current?.floors[0] ? moveToFloor(next, current.floors[0]) : next);
	}

	function leave(safe: boolean) {
		if (climbing !== null) return;
		if (here > 0 && !reduceMotion()) {
			climbing = here;
			const step = () => {
				if (climbing === null) return;
				if (climbing > 0) {
					climbing--;
					setTimeout(step, 160);
				} else {
					climbing = null;
					finishLeaving(safe);
				}
			};
			setTimeout(step, 160);
			return;
		}
		finishLeaving(safe);
	}

	function finishLeaving(safe: boolean) {
		notice = safe
			? 'Jacked out. The Architecture resets: a new run starts from the top (Core p. 198).'
			: 'Unsafe Jack Out: every enemy Black ICE you met and didn’t Derez takes effect on you now (Core p. 198). The Architecture resets.';
		onchange(jackOut(run));
	}
</script>

<p class="status" class:live={run.jackedIn} aria-live="polite">
	{#if run.jackedIn}
		<strong>JACKED IN</strong>{run.architectureName ? ` · ${run.architectureName}` : ''} · {positionOf(run)}
	{:else}
		NOT JACKED IN
	{/if}
</p>

<div class="row">
	{#if run.jackedIn}
		<button type="button" onclick={() => leave(true)} disabled={climbing !== null || left === 0}>JACK OUT</button>
		<button type="button" class="danger" onclick={() => leave(false)} disabled={climbing !== null}>LEFT RANGE</button>
	{:else}
		<button type="button" onclick={enter}>JACK IN</button>
	{/if}
</div>
<p class="dim small">
	{run.jackedIn
		? 'Jack Out is a NET Action. LEFT RANGE is for when you moved away or were dragged off first.'
		: `Jack In is a NET Action, within ${range} of an access point (Core p. 198).`}
</p>

{#if notice}<p class="notice" role="status">{notice}</p>{/if}
<p class="small"><a href="/rules/net">NET RULES →</a></p>

<label class="arch">
	<span>ARCHITECTURE</span>
	{#if architectures && architectures.length}
		<select value={run.architectureId ?? ''} onchange={(e) => choose(e.currentTarget.value)}>
			<option value="">None: count floors myself</option>
			{#each architectures as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
		</select>
	{:else}
		<span class="dim">
			{#if run.architectureName}{run.architectureName}{:else if !signedIn}Sign in to use your campaign's revealed floors.{:else if loadError}{loadError}{:else if architectures}No floors revealed yet.{:else}Loading…{/if}
		</span>
	{/if}
	{#if signedIn}<button type="button" class="small-btn" onclick={() => reload++} aria-label="Refresh Architectures">↻</button>{/if}
</label>

{#if run.jackedIn}
	<div class="turn">
		<span class="pips" role="img" aria-label="{left} of {perTurn} NET Actions left this Turn">
			{#each Array.from({ length: perTurn }, (_, i) => i) as i (i)}<span class="pip" class:on={i < left}></span>{/each}
		</span>
		<span class="small">{left} / {perTurn} NET ACTIONS</span>
		<button type="button" onclick={() => onchange(newTurn(run))} disabled={climbing !== null}>END TURN</button>
	</div>
	{#if current || !run.architectureId}
		<NetStairs {steps} current={climbing ?? here} deeper canAct={left > 0 && climbing === null} onmove={move} {onability} />
	{/if}
	{#if !current && !run.architectureId}
		<div class="row">
			<button type="button" onclick={() => onchange(moveTo(run, run.floor - 1))} disabled={run.floor <= 1}>▲ UP</button>
			<span>{positionOf(run)}</span>
			<button type="button" onclick={() => onchange(moveTo(run, run.floor + 1))}>▼ DOWN</button>
		</div>
	{/if}
	<p class="dim small">Moving between floors is free, unless something like a Password blocks the way (Core p. 198).</p>

	<ul class="risks" aria-label="Meatspace risks">
		{#each meatspaceRisks(seesMeat, range) as risk (risk)}<li>{risk}</li>{/each}
	</ul>
{/if}

<style>
	p {
		margin: 0.25rem 0;
	}

	.status.live strong {
		color: var(--bright);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 0;
	}

	button,
	select {
		min-height: 44px;
	}

	.turn {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin: 0.5rem 0 0;
	}

	.turn button {
		margin-left: auto;
	}

	.pips {
		display: inline-flex;
		gap: 4px;
	}

	.pip {
		width: 10px;
		height: 10px;
		border: 1px solid var(--bright);
	}

	.pip.on {
		background: var(--bright);
		box-shadow: 0 0 6px var(--bright-glow);
	}

	.danger {
		color: var(--red);
		border-color: var(--red);
	}

	.arch {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.arch select {
		flex: 1 1 12rem;
		min-width: 0;
	}

	.small-btn {
		min-width: 44px;
	}

	ul {
		list-style: none;
		margin: 0.4rem 0;
		padding: 0;
	}



	.risks {
		display: grid;
		gap: 0.3rem;
		overflow-wrap: anywhere;
	}

	.risks li {
		color: var(--red);
	}

	.risks li::before {
		content: '! ';
	}

	.notice {
		color: var(--bright);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}
</style>
