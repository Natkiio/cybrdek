<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import { armorPenalty, covers, equipArmor, currentSp, wornSp } from '#lib/rulesets/red/armor.ts';
	import type { GearItem } from '#lib/rulesets/red/gear.ts';

	let { gear, onchange }: { gear: GearItem[]; onchange: (gear: GearItem[]) => void } = $props();
	const sp = $derived(wornSp(gear));
	const penalty = $derived(armorPenalty(gear));
	function patch(id: string, changes: Partial<GearItem>) {
		onchange(gear.map((g) => g.id === id ? { ...g, ...changes } : g));
	}
</script>

<Panel title="ARMOR / STOPPING POWER">
	<p class="readout">HEAD <strong>{sp.head}</strong> · BODY <strong>{sp.body}</strong></p>
	<p class="dim">{penalty} REF / DEX / MOVE (worst worn penalty, once). Add armor in GEAR.</p>
	{#each gear.filter((g) => g.kind === 'armor') as item (item.id)}
		<div class="armor">
			<label><input type="checkbox" checked={item.equipped !== false}
				onchange={(e) => onchange(equipArmor(gear, item.id, e.currentTarget.checked))} /> {item.name}</label>
			<div class="locations">
				{#each ['head', 'body'] as location}
					{#if covers(item, location as 'head' | 'body')}
						<span>{location.toUpperCase()} {currentSp(item, location as 'head' | 'body')}/{item.sp} SP</span>
					{/if}
				{/each}
				<button type="button" onclick={() => patch(item.id, { currentSp: {} })}>MARK REPAIRED</button>
			</div>
		</div>
	{/each}
	<p class="dim">SP does not stack. A penetrating hit ablates every worn layer at that location by 1.
		Mark repaired after completing repairs in play.</p>
</Panel>

<style>
	.readout strong { color: var(--mint); font-size: 1.4rem; }
	.dim { color: var(--muted); font-size: 0.85rem; }
	.armor { padding: 0.5rem 0; border-bottom: 1px solid var(--frame-dim); }
	label, .locations { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
	label { min-height: 44px; }
	button { min-height: 44px; }
</style>
