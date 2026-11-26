<script lang="ts">
	// Being in the NET (#100, part 4): jack in and out, pick the campaign
	// Architecture you're running and the floor you're on, and keep the
	// Meatspace risks in view. Players only ever get floors the GM revealed
	// (the database redacts the rest), so the floor list is those floors.
	import { readArchitectures } from '#lib/net/api.ts';
	import type { PlayerEntry } from '#lib/net/architecture.ts';
	import { chooseArchitecture, jackIn, jackOut, meatspaceRisks, moveTo, moveToFloor, positionOf, type NetRun } from '#lib/rulesets/red/netrun.ts';

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
		onchange
	}: {
		run: NetRun;
		seesMeat: boolean;
		range: string; // e.g. '6 m/yds', see accessRange
		campaignId: string;
		signedIn: boolean;
		onchange: (next: NetRun) => void;
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
	const floor = $derived(current?.floors.find((f) => f.id === run.floorId));

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
		<button type="button" onclick={() => leave(true)}>JACK OUT</button>
		<button type="button" class="danger" onclick={() => leave(false)}>LEFT RANGE</button>
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
	{#if current}
		<ul class="floors" aria-label="Revealed floors">
			{#each current.floors as f (f.id)}
				<li>
					<button type="button" aria-pressed={f.id === run.floorId} onclick={() => onchange(moveToFloor(run, f))}>{f.label}</button>
				</li>
			{/each}
		</ul>
		{#if floor?.entries.length}
			<ul class="entries" aria-label="On this floor">
				{#each floor.entries as e (e.id)}
					<li><strong>{e.name}</strong> <span class="dim">· {e.type}</span>{#if e.playerText}<br /><span class="small">{e.playerText}</span>{/if}</li>
				{/each}
			</ul>
		{/if}
	{:else if !run.architectureId}
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

	.floors {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.floors button[aria-pressed='true'] {
		color: var(--bright);
		border-color: var(--bright);
	}

	.entries,
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
