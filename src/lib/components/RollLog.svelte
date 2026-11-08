<script lang="ts">
	import { sharedRolls, type CampaignRoll } from '#lib/rolls/campaign.svelte.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';
	import { CAMPAIGN_ROLLS_ALWAYS_VISIBLE, CAMPAIGN_ROLL_LIMIT, GM_HIDDEN_ROLLS } from '#lib/rolls/settings.ts';
	import type { RollEntry } from '#lib/rolls/log.svelte.ts';
	import Panel from '#lib/components/Panel.svelte';
	import { clearRolls, getRolls, isCrit, isFumble } from '#lib/rolls/log.svelte.ts';

	let { characterId, limit = 20 }: { characterId?: string; limit?: number } = $props();
	let confirmingClear = $state(false);
	let campaignView = $state(true);
	let showingCampaign = $derived(campaignView && sharedRolls.member && CAMPAIGN_ROLLS_ALWAYS_VISIBLE);
	let campaignEntries = $derived([
		...sharedRolls.pendingEntries,
		...sharedRolls.entries.filter((entry) => !sharedRolls.pendingEntries.some((pending) => pending.id === entry.id))
	].slice(0, CAMPAIGN_ROLL_LIMIT));
	let entries = $derived<(RollEntry | CampaignRoll)[]>(showingCampaign
		? campaignEntries : getRolls(characterId).slice(0, limit));

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
	{#if sharedRolls.member && CAMPAIGN_ROLLS_ALWAYS_VISIBLE}
		<div class="actions">
			<button type="button" aria-pressed={showingCampaign} onclick={() => (campaignView = true)}>CAMPAIGN</button>
			<button type="button" aria-pressed={!showingCampaign} onclick={() => (campaignView = false)}>DEVICE</button>
		</div>
		{#if gm.isGm && GM_HIDDEN_ROLLS}
			<label class="visibility"><input type="checkbox" bind:checked={sharedRolls.hidden} /> HIDE MY NEXT ROLLS (GM ONLY)</label>
		{/if}
	{/if}
	{#if gm.userId && sharedRolls.status}<p class="empty" role="status">{sharedRolls.status}</p>{/if}
	{#if sharedRolls.pending}<p class="empty">{sharedRolls.pending} campaign roll(s) waiting to send.</p>{/if}
	{#if entries.length === 0}
		<p class="empty">No rolls yet.</p>
	{:else}
		{#if !showingCampaign}<div class="actions">
			{#if confirmingClear}
				<span class="confirm">CLEAR LOG?</span>
				<button type="button" class="confirm-yes" onclick={confirmClear}>YES</button>
				<button type="button" onclick={() => (confirmingClear = false)}>NO</button>
			{:else}
				<button type="button" onclick={() => (confirmingClear = true)}>CLEAR</button>
			{/if}
		</div>{/if}

		<ol class="rolls">
			{#each entries as entry (entry.id)}
				{@const crit = isCrit(entry)}
				{@const fumble = isFumble(entry)}
				<li class:crit class:fumble class="flash">
					<div class="main">
						<span class="label">{entry.label}</span>
						{#if 'userId' in entry}<span class="author" title={entry.userId} aria-label={`Rolled by ${entry.userId}`}>{entry.userId === gm.userId ? 'YOU' : (entry.rollerName ?? `PLAYER ${entry.userId.slice(0, 4)}…${entry.userId.slice(-4)}`)}</span>{/if}
						{#if showingCampaign && sharedRolls.pendingEntries.some((pending) => pending.id === entry.id)}<span class="tag">PENDING</span>{/if}
						{#if 'hidden' in entry && entry.hidden}<span class="tag">GM ONLY</span>{/if}
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
	.visibility { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; color: var(--muted); font-size: 0.75rem; }
	.actions { display: flex; justify-content: flex-end; align-items: center; gap: 0.4rem; margin: -0.15rem 0 0.7rem; }
	button { min-height: 44px; padding: 0.35rem 0.7rem; font-size: 0.8rem; }
	.confirm { color: var(--red-soft); font-size: 0.8rem; }
	.confirm-yes { color: var(--red-soft); border-color: var(--red-dim); }
	.empty { color: var(--muted); margin: 0; }
	.rolls { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
	li { border-left: 2px solid var(--frame-dim); background: var(--bg-2); padding: 0.5rem 0.55rem; }
	.main, .result { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
	.main { flex-wrap: wrap; margin-bottom: 0.2rem; }
	.label { color: var(--label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.author { max-width: 100%; overflow-wrap: anywhere; color: var(--muted); font-size: 0.75rem; }
	.kind, time { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
	.kind { margin-left: auto; }
	.dice, .modifier { color: var(--value); }
	.dice { overflow-wrap: anywhere; min-width: 0; }
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
