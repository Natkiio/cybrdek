<script lang="ts">
	import { BLACK_ICE, DEMONS } from '#lib/rulesets/red/net-security.ts';
	let { type, refId, compact = false }: { type: string; refId: string | null; compact?: boolean } = $props();
	const ice = $derived(type === 'black-ice' ? BLACK_ICE.find((d) => d.id === refId) : undefined);
	const demon = $derived(type === 'demon' ? DEMONS.find((d) => d.id === refId) : undefined);
	const stats = $derived(ice
		? [['PER', ice.per], ['SPD', ice.spd], ['ATK', ice.atk], ['DEF', ice.def], ['REZ', ice.rez]]
		: demon ? [['REZ', demon.rez], ['Interface', demon.interface], ['NET Actions', demon.netActions], ['Combat Number', demon.combatNumber]] : []);
</script>

{#if compact && (ice || demon)}
	<div class="compact" role="group" aria-label="{(ice ?? demon)!.name} stats">
		<div class="reference"><strong>{(ice ?? demon)!.name}</strong><span>Core p. {(ice ?? demon)!.page}</span></div>
		<dl>{#each stats as [label, value]}<div><dt>{label}</dt><dd>{value}</dd></div>{/each}</dl>
	</div>
{:else if ice}
	<p class="stats">
		{ice.name} · PER {ice.per} · SPD {ice.spd} · ATK {ice.atk} · DEF {ice.def} · REZ {ice.rez} · Core
		p. {ice.page}
	</p>
{:else if demon}
	<p class="stats">
		{demon.name} · REZ {demon.rez} · Interface {demon.interface} · NET Actions {demon.netActions} · Combat
		Number {demon.combatNumber} · Core p. {demon.page}
	</p>
{/if}

<style>
	.compact { max-width: 34rem; border: 1px solid var(--frame-dim); background: var(--bg-1); padding: 0.5rem; margin-top: 0.5rem; }
	.reference { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 0.75rem; font-size: 0.8rem; overflow-wrap: anywhere; }
	.reference strong { color: var(--value); }
	.reference span { color: var(--muted); }
	dl { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 0.5rem 0 0; }
	dl > div { display: grid; grid-template-rows: 1fr auto; text-align: center; padding: 0 0.2rem; border-left: 1px solid var(--frame-dim); }
	dl > div:first-child { border-left: none; }
	dt { color: var(--label); font-size: 0.65rem; overflow-wrap: anywhere; }
	dd { margin: 0.25rem 0 0; color: var(--bright); font-size: 1rem; }

	.stats {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
</style>
