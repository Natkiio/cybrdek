<script lang="ts">
 import { BLACK_ICE, DEMONS } from '#lib/rulesets/red/net-security.ts';
 let { type, refId }: { type: string; refId: string | null } = $props();
 const ice = $derived(type === 'black-ice' ? BLACK_ICE.find(d => d.id === refId) : undefined);
 const demon = $derived(type === 'demon' ? DEMONS.find(d => d.id === refId) : undefined);
</script>
{#if ice}
 <p class="stats">{ice.name} · PER {ice.per} · SPD {ice.spd} · ATK {ice.atk} · DEF {ice.def} · REZ {ice.rez} · Core p. {ice.page}</p>
{:else if demon}
 <p class="stats">{demon.name} · REZ {demon.rez} · Interface {demon.interface} · NET Actions {demon.netActions} · Combat Number {demon.combatNumber} · Core p. {demon.page}</p>
{/if}
<style>.stats { color: var(--muted); overflow-wrap: anywhere; }</style>
