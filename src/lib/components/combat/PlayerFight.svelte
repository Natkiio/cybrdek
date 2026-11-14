<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import type { PlayerEncounter } from '#lib/combat/api.ts';
	import { WOUND_LABELS } from '#lib/rulesets/red/wounds.ts';
	let { encounter }: { encounter: PlayerEncounter } = $props();
</script>

<Panel title="THE FIGHT · READ ONLY">
	{#if encounter.combatants.length === 0}
		<p class="dim">The GM hasn't added anyone yet.</p>
	{:else}
		{#if encounter.started}<p>ROUND {encounter.round}</p>{/if}
		<ol aria-label="Initiative queue">
			{#each encounter.combatants as c (c.id)}
				<li class:current={c.id === encounter.currentId}>
					<div><strong>{c.name}</strong> <span class="dim">{c.side === 'pc' ? 'PC' : 'NPC'}</span>
						{#if c.id === encounter.currentId}<span class="turn">TURN</span>{/if}</div>
					<div>{c.wound === 'dead' ? 'Dead' : WOUND_LABELS[c.wound]}</div>
					{#if c.hp !== undefined && c.sp}
						<div class="own">YOUR CHARACTER · HP {c.hp}/{c.maxHp} · SP {c.sp.head}/{c.sp.body}</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</Panel>

<style>
	ol { margin: 0; padding-left: 1.6rem; display: grid; gap: 0.65rem; }
	li { padding: 0.6rem; border: 1px solid var(--frame-dim); overflow-wrap: anywhere; }
	li.current { border-color: var(--red); }
	strong { color: var(--value); }
	.dim { color: var(--muted); }
	.turn { color: var(--red-soft); margin-left: 0.6rem; }
	.own { color: var(--mint); margin-top: 0.3rem; }
</style>
