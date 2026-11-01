<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import GearEditor from '#lib/components/sheet/GearEditor.svelte';
	import {
		ARMOR_TYPES,
		armorFromType,
		WEAPON_TYPES,
		weaponFromType,
		wornSp,
		type GearItem,
		type GearKind
	} from '#lib/rulesets/red/gear.ts';
	import { skills } from '#lib/rulesets/red/skills.ts';

	let {
		gear,
		attackBase,
		onchange,
		onattack,
		ondamage
	}: {
		gear: GearItem[];
		attackBase: (skillId: string) => number; // STAT + skill + wound penalty
		onchange: (gear: GearItem[]) => void;
		onattack: (item: GearItem) => void;
		ondamage: (item: GearItem) => void;
	} = $props();

	// What's open: a new item being added, or an existing one being edited.
	let editing = $state<{ item: GearItem; isNew: boolean } | null>(null);
	let confirmingRemove = $state<string | null>(null);

	const sp = $derived(wornSp(gear));
	const groups = $derived(
		(['weapon', 'armor', 'item'] as GearKind[])
			.map((kind) => ({ kind, items: gear.filter((g) => g.kind === kind) }))
			.filter((g) => g.items.length > 0)
	);
	const LABELS: Record<GearKind, string> = { weapon: 'WEAPONS', armor: 'ARMOR', item: 'GEAR' };

	function add(kind: GearKind) {
		const id = crypto.randomUUID();
		const item: GearItem =
			kind === 'weapon'
				? weaponFromType(WEAPON_TYPES.find((t) => t.id === 'heavy-pistol')!, id)
				: kind === 'armor'
					? armorFromType(ARMOR_TYPES.find((t) => t.id === 'light-armorjack')!, id, 'body')
					: { id, kind: 'item', name: '', quantity: 1 };
		editing = { item, isNew: true };
	}

	function save(item: GearItem) {
		onchange(editing?.isNew ? [...gear, item] : gear.map((g) => (g.id === item.id ? item : g)));
		editing = null;
	}

	function patch(id: string, changes: Partial<GearItem>) {
		onchange(gear.map((g) => (g.id === id ? { ...g, ...changes } : g)));
	}

	function remove(id: string) {
		onchange(gear.filter((g) => g.id !== id));
		confirmingRemove = null;
	}

	function attack(item: GearItem) {
		onattack(item);
		if (item.magazine !== undefined) patch(item.id, { ammo: Math.max(0, (item.ammo ?? 0) - 1) });
	}

	const skillName = (id?: string) => skills.find((s) => s.id === id)?.name ?? '—';
</script>

<Panel title="GEAR">
	<div class="summary">
		<span>SP HEAD <strong>{sp.head}</strong></span>
		<span>SP BODY <strong>{sp.body}</strong></span>
	</div>

	{#if gear.length === 0 && !editing}
		<p class="dim">Nothing on you, choom. Add a weapon to roll attacks and damage.</p>
	{/if}

	{#each groups as group (group.kind)}
		<h3>{LABELS[group.kind]}</h3>
		<ul class="items">
			{#each group.items as item (item.id)}
				<li>
					{#if editing && !editing.isNew && editing.item.id === item.id}
						<GearEditor item={editing.item} onsave={save} oncancel={() => (editing = null)} />
					{:else}
						<div class="row">
							<div class="info">
								<span class="name">{item.name}</span>
								<span class="dim small">
									{#if item.kind === 'weapon'}
										{skillName(item.skill)} · {item.damage} · ROF {item.rof}
									{:else if item.kind === 'armor'}
										{item.location === 'head' ? 'Head' : 'Body'} · SP {item.sp}{item.penalty
											? ` · ${item.penalty} REF/DEX/MOVE`
											: ''}
									{:else}
										×{item.quantity ?? 1}
									{/if}
									{#if item.notes}· {item.notes}{/if}
								</span>
							</div>

							{#if item.kind === 'weapon'}
								<div class="weapon-actions">
									<button
										type="button"
										class="attack"
										disabled={item.magazine !== undefined && (item.ammo ?? 0) === 0}
										onclick={() => attack(item)}
									>
										ATTACK <span class="base">{attackBase(item.skill ?? '')}</span>
									</button>
									<button type="button" class="damage" onclick={() => ondamage(item)}>DMG {item.damage}</button>
									{#if item.magazine !== undefined}
										<span class="ammo" class:empty={(item.ammo ?? 0) === 0}>{item.ammo ?? 0}/{item.magazine}</span>
										<button
											type="button"
											disabled={item.ammo === item.magazine}
											onclick={() => patch(item.id, { ammo: item.magazine })}>RELOAD</button
										>
									{/if}
								</div>
							{:else if item.kind === 'item'}
								<div class="qty">
									<button
										type="button"
										aria-label="One fewer {item.name}"
										disabled={(item.quantity ?? 1) <= 0}
										onclick={() => patch(item.id, { quantity: (item.quantity ?? 1) - 1 })}>−</button
									>
									<button
										type="button"
										aria-label="One more {item.name}"
										onclick={() => patch(item.id, { quantity: (item.quantity ?? 1) + 1 })}>+</button
									>
								</div>
							{/if}

							<div class="manage">
								{#if confirmingRemove === item.id}
									<span class="warn">REMOVE?</span>
									<button type="button" class="damage" onclick={() => remove(item.id)}>YES</button>
									<button type="button" onclick={() => (confirmingRemove = null)}>NO</button>
								{:else}
									<button type="button" onclick={() => (editing = { item, isNew: false })}>EDIT</button>
									<button type="button" onclick={() => (confirmingRemove = item.id)}>REMOVE</button>
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}

	{#if editing?.isNew}
		<GearEditor item={editing.item} onsave={save} oncancel={() => (editing = null)} />
	{:else}
		<div class="add">
			<button type="button" onclick={() => add('weapon')}>+ WEAPON</button>
			<button type="button" onclick={() => add('armor')}>+ ARMOR</button>
			<button type="button" onclick={() => add('item')}>+ ITEM</button>
		</div>
	{/if}
</Panel>

<style>
	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	.summary {
		display: flex;
		gap: 1rem;
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--muted);
		margin-bottom: 0.5rem;
	}

	.summary strong {
		font-family: var(--f-mono);
		font-size: 1.2rem;
		color: var(--mint);
		margin-left: 0.3rem;
	}

	h3 {
		margin: 0.9rem 0 0.3rem;
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		color: var(--muted);
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--bg-3);
	}

	.info {
		display: flex;
		flex-direction: column;
		flex: 1 1 12rem;
		min-width: 0;
	}

	.name {
		color: var(--value);
	}

	.weapon-actions,
	.qty,
	.manage,
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}

	button {
		min-height: 44px;
		padding: 0 0.7rem;
	}

	.qty button {
		min-width: 44px;
	}

	.attack {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.base {
		margin-left: 0.3rem;
		font-size: 1.05rem;
	}

	.damage {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.ammo {
		min-width: 4ch;
		text-align: center;
		color: var(--value);
	}

	.ammo.empty {
		color: var(--red);
	}

	.warn {
		color: var(--red-soft);
	}

	.add {
		margin-top: 0.75rem;
	}
</style>
