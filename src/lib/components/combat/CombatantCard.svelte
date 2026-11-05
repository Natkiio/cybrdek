<script lang="ts">
	import { spOf, type Combatant, type HitLocation } from '#lib/combat/encounter.ts';
	import { actionPenalty, WOUND_LABELS, woundState } from '#lib/rulesets/red/wounds.ts';

	let {
		combatant,
		started,
		isCurrent,
		ondamage,
		onheal,
		onroll,
		oninitiative,
		onout,
		onremove
	}: {
		combatant: Combatant;
		started: boolean;
		isCurrent: boolean;
		ondamage: (amount: number, location: HitLocation) => void;
		onheal: (amount: number) => void;
		onroll: () => void;
		oninitiative: (value: number | null) => void;
		onout: (out: boolean) => void;
		onremove: () => void;
	} = $props();

	let open = $state(false);
	let amount = $state<number | null>(null);
	let location = $state<HitLocation>('body');
	let confirmingRemove = $state(false);

	const wound = $derived(woundState(combatant.hp, combatant.maxHp));
	const penalty = $derived(actionPenalty(wound));
	const sp = $derived(spOf(combatant));

	function apply(kind: 'damage' | 'heal') {
		if (!amount || amount < 0) return;
		if (kind === 'damage') ondamage(amount, location);
		else onheal(amount);
		amount = null;
	}

	function typed(event: Event) {
		const raw = (event.currentTarget as HTMLInputElement).value;
		const value = raw === '' ? null : Number(raw);
		oninitiative(value !== null && Number.isFinite(value) ? value : null);
	}
</script>

<li class="card state-{wound}" class:current={isCurrent} class:out={combatant.out}>
	<button type="button" class="row" aria-expanded={open} onclick={() => (open = !open)}>
		<span class="init" title="Initiative">{combatant.initiative ?? '–'}</span>
		<span class="who">
			<span class="name">{combatant.name}{#if isCurrent}<span class="turn">TURN</span>{/if}</span>
			<span class="meta">
				{#if combatant.out}OUT{:else}{WOUND_LABELS[wound]}{penalty ? ` · ${penalty} to actions` : ''}{/if}
			</span>
		</span>
		<span class="stats">
			<span class="hp">{combatant.hp}<small>/{combatant.maxHp}</small></span>
			<span class="sp">SP {sp.head}/{sp.body}</span>
		</span>
	</button>

	{#if !started}
		<div class="setup">
			<span class="dim small">
				{combatant.roll !== null ? `REF ${combatant.ref} + ${combatant.roll}` : `REF ${combatant.ref}`}
			</span>
			<button type="button" onclick={onroll}>ROLL</button>
			<input
				type="number"
				inputmode="numeric"
				aria-label="Initiative for {combatant.name}"
				placeholder="type"
				value={combatant.initiative ?? ''}
				onchange={typed}
			/>
		</div>
	{/if}

	{#if open}
		<div class="tools">
			<div class="amount">
				<input type="number" inputmode="numeric" min="0" placeholder="amount" aria-label="Amount for {combatant.name}" bind:value={amount} />
				<select aria-label="Hit location for {combatant.name}" bind:value={location}>
					<option value="body">Body (subtract SP)</option>
					<option value="head">Aimed head shot (SP, then ×{combatant.headMultiplier ?? 2})</option>
					<option value="direct">Ignore armor</option>
				</select>
			</div>
			<div class="buttons">
				<button type="button" class="damage" disabled={!amount} onclick={() => apply('damage')}>DAMAGE</button>
				<button type="button" class="heal" disabled={!amount} onclick={() => apply('heal')}>HEAL</button>
				<button type="button" onclick={() => onout(!combatant.out)}>{combatant.out ? 'BACK IN' : 'KNOCK OUT'}</button>
				{#if confirmingRemove}
					<button type="button" class="damage" onclick={onremove}>CONFIRM REMOVE</button>
				{:else}
					<button type="button" onclick={() => (confirmingRemove = true)}>REMOVE</button>
				{/if}
			</div>
			{#if wound === 'mortally' && !combatant.out}
				<p class="warn small">Mortally Wounded: Death Save at the start of each Turn.</p>
			{/if}
		</div>
	{/if}
</li>

<style>
	.card {
		list-style: none;
		border: 1px solid var(--frame-dim);
		border-left: 2px solid var(--frame);
		background: var(--bg-1);
	}

	.card.current {
		border-color: var(--red);
		box-shadow: 0 0 10px var(--red-glow);
	}

	.card.out {
		opacity: 0.55;
	}

	.row {
		display: grid;
		grid-template-columns: 2.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		min-height: 56px;
		padding: 0.5rem 0.75rem;
		border: none;
		background: none;
		text-align: left;
	}

	.init {
		font-size: 1.4rem;
		color: var(--mint);
		text-align: center;
	}

	.who {
		display: grid;
		min-width: 0;
	}

	.name {
		color: var(--value);
		overflow-wrap: anywhere;
	}

	.turn {
		margin-left: 0.5rem;
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--red);
	}

	.meta,
	.sp {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.state-seriously .meta,
	.state-mortally .meta,
	.state-seriously .hp,
	.state-mortally .hp {
		color: var(--red-soft);
	}

	.stats {
		display: grid;
		justify-items: end;
	}

	.hp {
		font-size: 1.15rem;
		color: var(--mint);
	}

	.hp small {
		color: var(--muted);
		font-size: 0.75rem;
	}

	.setup,
	.tools {
		padding: 0 0.75rem 0.6rem;
	}

	.setup {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 5rem;
		align-items: center;
		gap: 0.4rem;
	}

	.amount {
		display: grid;
		grid-template-columns: 6rem minmax(0, 1fr);
		gap: 0.4rem;
		margin-bottom: 0.4rem;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	input,
	select,
	.setup button,
	.buttons button {
		min-height: 44px;
		min-width: 0;
		width: 100%;
	}

	.buttons button {
		width: auto;
	}

	.damage {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.heal {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	.warn {
		color: var(--red-soft);
		margin: 0.5rem 0 0;
	}
</style>
