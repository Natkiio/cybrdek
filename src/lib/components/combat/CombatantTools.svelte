<script lang="ts">
	// What the GM can do to one combatant (#101 turn console): damage and heal,
	// initiative before the fight starts, and the admin actions kept apart
	// under MANAGE. The calls are the same ones the old queue cards made.
	import { type Combatant, type HitLocation } from '#lib/combat/encounter.ts';
	import { woundState } from '#lib/rulesets/red/wounds.ts';

	let {
		combatant,
		started,
		ondamage,
		onheal,
		onroll,
		oninitiative,
		onout,
		ondead,
		onremove
	}: {
		combatant: Combatant;
		started: boolean;
		ondamage?: (amount: number, location: HitLocation) => void; // absent for NET security
		onheal?: (amount: number) => void;
		onroll: () => void;
		oninitiative: (value: number | null) => void;
		onout?: (out: boolean) => void;
		ondead?: (dead: boolean) => void;
		onremove: () => void;
	} = $props();

	let amount = $state<number | null>(null);
	let location = $state<HitLocation>('body');
	let confirmingRemove = $state(false);
	const wound = $derived(woundState(combatant.hp, combatant.maxHp));

	// A different combatant starts with a clean form.
	let last = '';
	$effect(() => {
		if (combatant.id === last) return;
		last = combatant.id;
		amount = null;
		location = 'body';
		confirmingRemove = false;
	});

	function apply(kind: 'damage' | 'heal') {
		if (!amount || amount < 0) return;
		if (kind === 'damage') ondamage?.(amount, location);
		else onheal?.(amount);
		amount = null;
	}

	function typed(event: Event) {
		const raw = (event.currentTarget as HTMLInputElement).value;
		const value = raw === '' ? null : Number(raw);
		oninitiative(value !== null && Number.isFinite(value) ? value : null);
	}
</script>

<div class="tools">
	{#if !started}
		<div class="group">
			<span class="legend">INITIATIVE</span>
			<div class="row">
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
		</div>
	{/if}

	{#if ondamage}
		<div class="group">
			<span class="legend">DAMAGE OR HEAL</span>
			<div class="pair">
				<input type="number" inputmode="numeric" min="0" placeholder="amount" aria-label="Amount for {combatant.name}" bind:value={amount} />
				<select aria-label="Hit location for {combatant.name}" bind:value={location}>
					<option value="body">Body (subtract SP)</option>
					<option value="head">Aimed head shot (SP, then ×{combatant.headMultiplier ?? 2})</option>
					<option value="direct">Ignore armor</option>
				</select>
			</div>
			<div class="row">
				<button type="button" class="primary" disabled={!amount} onclick={() => apply('damage')}>DAMAGE</button>
				<button type="button" disabled={!amount} onclick={() => apply('heal')}>HEAL</button>
			</div>
			{#if wound === 'mortally' && !combatant.out}
				<p class="warn small">Mortally Wounded: Death Save at the start of each Turn.</p>
			{/if}
		</div>
	{/if}

	<details class="manage">
		<summary>⋯ MANAGE {combatant.name.toUpperCase()}</summary>
		<div class="row">
			{#if started}
				<label class="init"
					>Initiative
					<input
						type="number"
						inputmode="numeric"
						aria-label="Initiative for {combatant.name}"
						value={combatant.initiative ?? ''}
						onchange={typed}
					/>
				</label>
			{/if}
			{#if onout}<button type="button" onclick={() => onout(!combatant.out)}>{combatant.out ? 'BACK IN' : 'KNOCK OUT'}</button>{/if}
			{#if ondead}
				<button type="button" class="danger" onclick={() => ondead(!combatant.dead)}
					>{combatant.dead ? 'CLEAR DEATH' : 'MARK DEAD'}: {combatant.name}</button
				>
			{/if}
			{#if confirmingRemove}
				<button type="button" class="danger" onclick={onremove}>CONFIRM REMOVE</button>
				<button type="button" onclick={() => (confirmingRemove = false)}>KEEP</button>
			{:else}
				<button type="button" class="danger" onclick={() => (confirmingRemove = true)}>REMOVE FROM FIGHT</button>
			{/if}
		</div>
	</details>
</div>

<style>
	.tools {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.group {
		display: grid;
		gap: 0.5rem;
		border-top: 1px solid var(--frame-dim);
		padding-top: 0.5rem;
	}

	.legend {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.14em;
		color: var(--muted);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.pair {
		display: grid;
		grid-template-columns: minmax(0, 7rem) minmax(0, 1fr);
		gap: 0.4rem;
	}

	input,
	select,
	button {
		min-height: 44px;
		min-width: 0;
	}

	/* Buttons that carry a name (MARK DEAD: …) wrap rather than widen the page. */
	button {
		max-width: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.row input {
		width: 6rem;
	}

	.init {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
	}

	.primary {
		background: var(--red);
		color: var(--ink-on-red);
		border-color: var(--red);
	}

	.danger {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.manage {
		border-top: 1px solid var(--frame-dim);
		padding-top: 0.25rem;
	}

	.manage summary {
		overflow-wrap: anywhere;
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--muted);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	.warn {
		color: var(--red-soft);
		margin: 0;
	}
</style>
