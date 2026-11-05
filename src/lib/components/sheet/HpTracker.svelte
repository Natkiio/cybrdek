<script lang="ts">
	import { ATTACK_RULES, type AttackType, type DamageOptions } from '#lib/rulesets/red/attacks.ts';
	import type { ArmorLocation } from '#lib/rulesets/red/gear.ts';
	import Panel from '#lib/components/Panel.svelte';
	import {
		actionPenalty,
		clampHp,
		WOUND_LABELS,
		woundState,
		type WoundState
	} from '#lib/rulesets/red/wounds.ts';

	// `onchange` lets the page save whenever HP changes; `ondeathsave` asks the page to roll one.
	let {
		hp,
		maxHp,
		seriouslyWounded,
		deathSave,
		deathSavePenalty,
		onchange,
		ondamage,
		ondeathsave,
		onresetpenalty
	}: {
		hp: number;
		maxHp: number;
		seriouslyWounded: number;
		deathSave: number;
		deathSavePenalty: number;
		onchange: (hp: number) => void;
		ondamage: (amount: number, location: ArmorLocation, options?: DamageOptions) => void;
		ondeathsave: () => void;
		onresetpenalty: () => void;
	} = $props();

	let location = $state<ArmorLocation>('body');
	let attackType = $state<AttackType>('ranged');
	let amount = $state<number | null>(null);

	const wound: WoundState = $derived(woundState(hp, maxHp));
	const penalty = $derived(actionPenalty(wound));
	const percent = $derived(Math.round((hp / maxHp) * 100));

	function set(next: number) {
		const clamped = clampHp(next, maxHp);
		if (clamped !== hp) onchange(clamped);
	}

	function apply(sign: 1 | -1) {
		if (!amount || amount < 0) return;
		if (sign === -1) ondamage(amount, location, { attackType });
		else set(hp + sign * amount);
		amount = null;
	}
</script>

<Panel title="HIT POINTS">
	<div class="readout state-{wound}">
		<span class="current">{hp}</span><span class="max">/ {maxHp}</span>
		<span class="badge">{WOUND_LABELS[wound]}{penalty ? ` · ${penalty} to all actions` : ''}</span>
	</div>

	<div
		class="bar state-{wound}"
		role="meter"
		aria-label="Hit points"
		aria-valuemin={0}
		aria-valuemax={maxHp}
		aria-valuenow={hp}
	>
		<div class="fill" style:width="{percent}%"></div>
		<div class="mark" style:left="{(seriouslyWounded / maxHp) * 100}%" title="Seriously Wounded threshold"></div>
	</div>

	<p class="dim">Quick buttons adjust HP directly (ignore armor).</p>
	<div class="quick">
		<button type="button" onclick={() => set(hp - 5)}>−5</button>
		<button type="button" onclick={() => set(hp - 1)}>−1</button>
		<button type="button" onclick={() => set(hp + 1)}>+1</button>
		<button type="button" onclick={() => set(hp + 5)}>+5</button>
	</div>

	<label class="damage-location">ATTACK TYPE
		<select aria-label="Attack type" bind:value={attackType}>
			{#each Object.entries(ATTACK_RULES) as [id, rule] (id)}
				<option value={id}>{rule.label}</option>
			{/each}
		</select>
	</label>
	<p class="dim">{ATTACK_RULES[attackType].hint}</p>
	<label class="damage-location">DAMAGE LOCATION
		<select aria-label="Damage location" bind:value={location} disabled={ATTACK_RULES[attackType].armor === 'bypass'}>
			<option value="body">Body</option>
			<option value="head">Head (aimed hit, multiply after SP)</option>
		</select>
	</label>
	<div class="amount">
		<input
			type="number"
			inputmode="numeric"
			min="0"
			placeholder="amount"
			aria-label="Damage or healing amount"
			bind:value={amount}
		/>
		<button type="button" class="damage" disabled={!amount} onclick={() => apply(-1)}>DAMAGE</button>
		<button type="button" class="heal" disabled={!amount} onclick={() => apply(1)}>HEAL</button>
		<button type="button" disabled={hp === maxHp} onclick={() => set(maxHp)}>FULL</button>
	</div>

	{#if wound === 'mortally'}
		<div class="death">
			<p>
				<strong>MORTALLY WOUNDED.</strong> Make a Death Save at the start of each of your Turns: d10 +
				penalty must roll <em>under</em> BODY ({deathSave}). Penalty now: +{deathSavePenalty}.
			</p>
			<button type="button" class="damage" onclick={ondeathsave}>ROLL DEATH SAVE</button>
		</div>
	{:else if deathSavePenalty > 0}
		<p class="dim">
			Death Save penalty +{deathSavePenalty}. It resets once you're stabilized.
			<button type="button" class="link" onclick={onresetpenalty}>RESET</button>
		</p>
	{/if}
</Panel>

<style>
	.readout {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
	}

	.current {
		font-size: 2.6rem;
		line-height: 1;
		color: var(--mint);
		text-shadow: 0 0 12px var(--mint-glow);
	}

	.max {
		color: var(--muted);
		font-size: 1.1rem;
	}

	.badge {
		margin-left: auto;
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--frame-dim);
		color: var(--label);
	}

	.state-seriously .current,
	.state-mortally .current {
		color: var(--red);
		text-shadow: 0 0 12px var(--red-glow);
	}

	.state-seriously .badge,
	.state-mortally .badge {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.bar {
		position: relative;
		height: 10px;
		margin: 0.75rem 0;
		background: var(--bg-3);
		border: 1px solid var(--frame-dim);
	}

	.fill {
		height: 100%;
		background: var(--mint);
		box-shadow: 0 0 8px var(--mint-glow);
		transition: width 0.2s ease;
	}

	.bar.state-seriously .fill,
	.bar.state-mortally .fill {
		background: var(--red);
		box-shadow: 0 0 8px var(--red-glow);
	}

	.mark {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 2px;
		background: var(--label);
	}

	.quick,
	.amount {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}

	.quick {
		grid-template-columns: repeat(4, 1fr);
	}

	.amount {
		grid-template-columns: minmax(5rem, 1fr) auto auto auto;
	}

	.damage-location { display: grid; gap: 0.35rem; margin-top: 0.75rem; }
	select { width: 100%; min-width: 0; min-height: 44px; background: var(--bg-2); color: var(--value); }
	button,
	input {
		min-height: 44px;
	}

	input {
		width: 100%;
	}

	.damage {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.heal {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.death {
		margin-top: 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--red-dim);
		background: var(--bg-2);
	}

	.death p {
		margin: 0 0 0.5rem;
	}

	.death strong {
		color: var(--red);
	}

	.dim {
		color: var(--muted);
		margin: 0.75rem 0 0;
	}

	.link {
		min-height: 0;
		padding: 0 0.3rem;
		background: none;
		border: none;
		color: var(--mint);
		text-decoration: underline;
		cursor: pointer;
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
