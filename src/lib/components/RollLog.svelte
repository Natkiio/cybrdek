<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import { clearRolls, getRolls, isCrit, isFumble } from '#lib/rolls/log.svelte.ts';

	let { characterId, limit = 20 }: { characterId?: string; limit?: number } = $props();
	let confirmingClear = $state(false);
	let entries = $derived(getRolls(characterId).slice(0, limit));

	function formatModifier(modifier: number): string {
		return `${modifier >= 0 ? '+' : ''}${modifier}`;
	}

	function formatTime(at: number): string {
		return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function confirmClear(): void {
		clearRolls(characterId);
		confirmingClear = false;
	}
</script>

<Panel title="ROLL LOG">
	{#if entries.length === 0}
		<p class="empty">No rolls yet.</p>
	{:else}
		<div class="actions">
			{#if confirmingClear}
				<span class="confirm">CLEAR LOG?</span>
				<button type="button" class="confirm-yes" onclick={confirmClear}>YES</button>
				<button type="button" onclick={() => (confirmingClear = false)}>NO</button>
			{:else}
				<button type="button" onclick={() => (confirmingClear = true)}>CLEAR</button>
			{/if}
		</div>

		<ol class="rolls">
			{#each entries as entry (entry.id)}
				{@const crit = isCrit(entry)}
				{@const fumble = isFumble(entry)}
				<li class:crit class:fumble class="flash">
					<div class="main">
						<span class="label">{entry.label}</span>
						<span class="kind">{entry.kind}</span>
						{#if crit}<span class="tag">CRIT</span>{/if}
						{#if fumble}<span class="tag">FUMBLE</span>{/if}
					</div>
					<div class="result">
						<span class="dice">[
							{#each entry.result.rolls as die, index}
								<span class:bonus-die={index === 1 && (crit || fumble)}>{die}</span>{index < entry.result.rolls.length - 1 ? ', ' : ''}
							{/each}
						]</span>
						<span class="modifier">{formatModifier(entry.result.modifier)}</span>
						<strong class="total">{entry.result.total}</strong>
						<time datetime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</Panel>

<style>
	.actions { display: flex; justify-content: flex-end; align-items: center; gap: 0.4rem; margin: -0.15rem 0 0.7rem; }
	button { min-height: 44px; padding: 0.35rem 0.7rem; font-size: 0.8rem; }
	.confirm { color: var(--red-soft); font-size: 0.8rem; }
	.confirm-yes { color: var(--red-soft); border-color: var(--red-dim); }
	.empty { color: var(--muted); margin: 0; }
	.rolls { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
	li { border-left: 2px solid var(--frame-dim); background: var(--bg-2); padding: 0.5rem 0.55rem; }
	.main, .result { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
	.main { margin-bottom: 0.2rem; }
	.label { color: var(--label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.kind, time { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
	.kind { margin-left: auto; }
	.dice, .modifier { color: var(--value); }
	.modifier { color: var(--mint-dim); }
	.total { margin-left: auto; color: var(--value); font-family: var(--f-text); font-size: 1.55rem; line-height: 1; }
	time { min-width: 3.4em; text-align: right; }
	.tag { color: var(--ink-on-red); background: var(--red); padding: 0.05rem 0.28rem; font-size: 0.65rem; font-weight: 700; }
	.crit { border-left-color: var(--mint); }
	.crit .tag { color: var(--bg-0); background: var(--mint); }
	.crit .total { color: var(--mint); }
	.fumble { border-left-color: var(--red); }
	.fumble .total { color: var(--red-soft); }
	.bonus-die { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 0.18em; }
	.flash { animation: flash 750ms ease-out; }
	@keyframes flash { from { background: var(--bg-3); box-shadow: inset 0 0 16px var(--mint-glow); } to { background: var(--bg-2); box-shadow: none; } }
	@media (prefers-reduced-motion: reduce) { .flash { animation: none; } }
</style>
