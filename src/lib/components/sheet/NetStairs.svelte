<script lang="ts" module>
	import type { PlayerEntry } from '#lib/net/architecture.ts';

	export interface Step {
		key: string;
		label: string;
		/** What the GM revealed on it, or null when we only count floors. */
		entries: PlayerEntry[] | null;
	}
</script>

<script lang="ts">
	// The NET as side-on stairs (#116): each floor is a step down and to the
	// right, the runner's marker slides between them, and the floor you're on
	// opens up to show what's there with the abilities that fit it. A dark step
	// below says the Architecture goes deeper, without saying how far.
	import { ABILITIES_FOR, INTERFACE_ABILITIES } from '#lib/rulesets/red/interface.ts';

	let {
		steps,
		current,
		deeper,
		canAct = true,
		onmove,
		onability
	}: {
		steps: Step[];
		current: number; // index into steps
		deeper: boolean; // draw a dark step below the last one
		canAct?: boolean; // false when no NET Actions are left this Turn
		onmove: (index: number) => void;
		onability: (abilityId: string) => void;
	} = $props();

	const TYPE_NAMES: Record<string, string> = {
		password: 'Password',
		file: 'File',
		'control-node': 'Control Node',
		'black-ice': 'Black ICE',
		demon: 'Demon'
	};
	const abilityName = (id: string) => INTERFACE_ABILITIES.find((a) => a.id === id)?.name ?? id;
	const summary = (s: Step) =>
		s.entries === null ? '' : s.entries.length ? s.entries.map((e) => e.name).join(' · ') : 'Nothing here';
	const abilitiesHere = $derived.by(() => {
		const ids = new Set<string>();
		for (const e of steps[current]?.entries ?? []) for (const id of ABILITIES_FOR[e.type] ?? []) ids.add(id);
		return [...ids];
	});

	// The marker is drawn once and moved to the current step, so it slides.
	let list = $state<HTMLOListElement>();
	let markerY = $state(0);
	let markerX = $state(0);
	$effect(() => {
		void steps.length;
		const index = current;
		const el = list?.children[index] as HTMLElement | undefined;
		if (!el) return;
		const place = () => {
			markerX = el.offsetLeft - 11;
			markerY = el.offsetTop + 22 - 11;
		};
		place();
		const watch = new ResizeObserver(place);
		watch.observe(list!);
		return () => watch.disconnect();
	});
</script>

<div class="stairs">
	<span class="marker" style:transform="translate({markerX}px, {markerY}px)" aria-hidden="true"></span>
	<ol bind:this={list} aria-label="Floors">
		{#each steps as s, i (s.key)}
			<li class="step" class:here={i === current} style:--i={Math.min(i, 5)}>
				<button type="button" class="go" aria-current={i === current ? 'step' : undefined} onclick={() => onmove(i)}>
					<span class="n">{String(i + 1).padStart(2, '0')}</span>
					<span class="label">{s.label}</span>
					{#if summary(s)}<span class="what">{summary(s)}</span>{/if}
				</button>
				{#if i === current && s.entries?.length}
					<ul class="entries" aria-label="On this floor">
						{#each s.entries as e (e.id)}
							<li>
								<strong>{e.name}</strong> <span class="dim">· {TYPE_NAMES[e.type] ?? e.type}</span>
								{#if e.playerText}<br /><span class="small">{e.playerText}</span>{/if}
							</li>
						{/each}
					</ul>
					{#if abilitiesHere.length}
						<div class="abilities">
							{#each abilitiesHere as id (id)}
								<button type="button" class="ability" disabled={!canAct} onclick={() => onability(id)} aria-label="Roll {abilityName(id)} here">
									ROLL {abilityName(id).toUpperCase()}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</li>
		{/each}
		{#if deeper}
			<li class="step dark" style:--i={Math.min(steps.length, 5)} aria-label="Deeper floors not revealed">
				<span class="n">{String(steps.length + 1).padStart(2, '0')}</span>
				<span class="label">? ? ?</span>
			</li>
		{/if}
	</ol>
</div>

<style>
	.stairs {
		--dx: min(8%, 2.25rem);
		position: relative;
		margin: 0.5rem 0;
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0 0 0 0.9rem;
		display: grid;
		gap: 0.6rem;
	}

	.step {
		position: relative;
		margin-left: calc(var(--i) * var(--dx));
		width: calc(100% - 5 * var(--dx));
		min-width: 0;
		border: 1px solid var(--frame-dim);
		background: var(--bg-2);
		transition:
			border-color 200ms ease,
			box-shadow 200ms ease;
	}

	/* A riser joins each step to the next one down. */
	.step:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 1.1rem;
		bottom: calc(-0.6rem - 1px);
		width: calc(var(--dx) + 1px);
		height: 0.6rem;
		border-left: 1px solid var(--frame-dim);
		border-bottom: 1px solid var(--frame-dim);
	}

	.step.here {
		border-color: var(--bright);
		box-shadow: 0 0 0 1px var(--bright), 0 0 16px var(--bright-glow);
	}

	.go {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.1rem 0.6rem;
		align-items: center;
		width: 100%;
		min-height: 44px;
		text-align: left;
		border: 0;
		box-shadow: none;
		background: transparent;
		color: inherit;
		padding: 0.4rem 0.6rem 0.4rem 1.1rem;
	}

	/* The app's button glow is for real buttons; a step lights its border instead. */
	.go:hover,
	.go:focus-visible {
		box-shadow: none;
		background: var(--bg-3);
	}

	.go:focus-visible {
		outline: 1px solid var(--bright);
		outline-offset: -3px;
	}

	.n {
		grid-row: span 2;
		color: var(--muted);
		font-size: 0.75rem;
	}

	.label {
		color: var(--bright);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.what {
		color: var(--muted);
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}

	.dark {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.6rem;
		align-items: center;
		min-height: 44px;
		padding: 0.4rem 0.6rem 0.4rem 1.1rem;
		background: transparent;
		border-style: dashed;
		opacity: 0.5;
	}

	.dark .label {
		color: var(--faint);
		letter-spacing: 0.3em;
	}

	.marker {
		position: absolute;
		left: 0;
		top: 0;
		width: 22px;
		height: 22px;
		z-index: 1;
		display: grid;
		place-items: center;
		pointer-events: none;
		transition: transform 300ms cubic-bezier(0.5, 0, 0.3, 1.4);
	}

	.marker::before {
		content: '';
		width: 12px;
		height: 12px;
		background: var(--red);
		transform: rotate(45deg);
		box-shadow: 0 0 10px var(--red-glow);
	}

	.entries {
		list-style: none;
		margin: 0;
		padding: 0 0.6rem 0.4rem;
		display: grid;
		gap: 0.3rem;
		overflow-wrap: anywhere;
	}

	.abilities {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0 0.6rem 0.6rem;
	}

	.ability {
		flex: 1 1 10rem;
		min-height: 44px;
		border-color: var(--red);
		color: var(--red);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.marker,
		.step {
			transition: none;
		}
	}
</style>
