<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import RollLog from '#lib/components/RollLog.svelte';
	import { rollExpression, type RollExpressionResult } from '#lib/engine/notation.ts';
	import { logRoll } from '#lib/rolls/log.svelte.ts';

	const quickRolls = ['d6', 'd10', '2d6', '3d6', '4d6', '5d6', '1d10'];
	let expression = $state('');
	let error = $state('');
	let latest = $state<Extract<RollExpressionResult, { ok: true }> | null>(null);
	let history = $state<string[]>([]);
	let historyIndex = $state(-1);
	let draftExpression = $state('');

	function roll(): void {
		if (expression.trim() && history[0] !== expression) {
			history = [expression, ...history.filter((item) => item !== expression)].slice(0, 20);
		}
		historyIndex = -1;

		const outcome = rollExpression(expression);
		if (!outcome.ok) {
			error = outcome.error;
			return;
		}

		error = '';
		latest = outcome;
		logRoll({ label: outcome.expression, kind: 'free', result: outcome.result });
	}

	function chooseQuickRoll(notation: string): void {
		expression = notation;
		roll();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp' && history.length > 0) {
			event.preventDefault();
			if (historyIndex === -1) draftExpression = expression;
			historyIndex = Math.min(historyIndex + 1, history.length - 1);
			expression = history[historyIndex];
		}
		if (event.key === 'ArrowDown' && historyIndex !== -1) {
			event.preventDefault();
			historyIndex -= 1;
			expression = historyIndex === -1 ? draftExpression : history[historyIndex];
		}
	}
</script>

<h1>DICE</h1>

<Panel title="FREE ROLLER">
	<form onsubmit={(event) => { event.preventDefault(); roll(); }}>
		<label class="sr-only" for="expression">Dice expression</label>
		<div class="roller-input">
			<span aria-hidden="true">&gt;</span>
			<input id="expression" bind:value={expression} onkeydown={handleKeydown} placeholder="3d6+2" autocomplete="off" />
			<button type="submit">ROLL</button>
		</div>
	</form>

	<div class="quick-rolls" aria-label="Quick rolls">
		{#each quickRolls as notation (notation)}
			<button type="button" onclick={() => chooseQuickRoll(notation)}>{notation}</button>
		{/each}
	</div>

	{#if error}<p class="error" role="alert">{error}</p>{/if}
</Panel>

{#if latest}
	<Panel title="RESULT">
		<div class="result-heading">
			<span class="label">{latest.expression}</span>
			<strong class="total">{latest.result.total}</strong>
		</div>
		<div class="groups">
			{#each latest.groups as group (group.notation)}
				<p><span class="label">{group.notation}</span> <span>[{group.rolls.join(', ')}]</span></p>
			{/each}
			{#if latest.result.modifier !== 0}<p><span class="label">MOD</span> {latest.result.modifier >= 0 ? '+' : ''}{latest.result.modifier}</p>{/if}
		</div>
	</Panel>
{/if}

<RollLog />

<style>
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.roller-input { display: flex; align-items: stretch; border: 1px solid var(--frame-dim); }
	.roller-input span { display: grid; place-items: center; min-width: 2.5rem; color: var(--red); background: var(--bg-2); }
	.roller-input input { min-width: 0; flex: 1; border: 0; font-size: 1.1rem; }
	.roller-input button, .quick-rolls button { min-height: 44px; }
	.roller-input button { border: 0; border-left: 1px solid var(--frame-dim); }
	.quick-rolls { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.75rem; }
	.quick-rolls button { color: var(--mint); font-size: 0.8rem; }
	.error { margin: 0.75rem 0 0; color: var(--red-soft); }
	.result-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
	.total { color: var(--mint); font-family: var(--f-text); font-size: 3rem; line-height: 1; }
	.groups { display: grid; gap: 0.25rem; margin-top: 0.75rem; color: var(--value); }
	.groups p { margin: 0; }
</style>
