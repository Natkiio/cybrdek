<script lang="ts">
 import Panel from '#lib/components/Panel.svelte';
 import { roll } from '#lib/engine/dice.ts';
 import { logRoll } from '#lib/rolls/log.svelte.ts';
 import type { ArmorLocation } from '#lib/rulesets/red/gear.ts';
 import { CRITICAL_INJURIES, injuryKey, receiveInjury, type CriticalInjury } from '#lib/rulesets/red/injuries.ts';

 let { injuries, hp, maxHp, characterId, offered = false, onchange }: {
  injuries: CriticalInjury[];
  hp: number;
  maxHp: number;
  characterId: string;
  offered?: boolean;
  onchange: (extra: Record<string, unknown>) => void;
 } = $props();
 let location = $state<ArmorLocation>('body');
 let preview = $state<{ injury: CriticalInjury; dice: number[]; received: boolean } | null>(null);
 const duplicate = $derived(preview?.received && injuries.some((i) => injuryKey(i) === injuryKey(preview!.injury)));
 const full = $derived(injuries.filter((i) => i.location === location).length === 11);

 function rollInjury(received: boolean) {
  const result = roll(2, 6, 0);
  preview = { injury: { location, roll: result.total }, dice: result.rolls, received };
  logRoll({ characterId, label: `Critical Injury (${location}, ${received ? 'received' : 'target'}): ${CRITICAL_INJURIES[location][result.total].name}`, kind: 'free', result });
 }
 function apply() {
  if (!preview?.received || duplicate) return;
  onchange(receiveInjury(injuries, preview.injury, hp, maxHp));
  preview = null;
 }
</script>

<Panel title="CRITICAL INJURIES">
 <p class="dim">Two or more damage dice showing 6 cause an injury, even through armor. Each new injury deals 5 direct HP damage. Core pp. 187–188.</p>
 <label>INJURY LOCATION
  <select bind:value={location}>
   <option value="body">Body (normal hit)</option>
   <option value="head">Head (aimed hit)</option>
  </select>
 </label>
 {#if offered}
  <p class="notice">Your damage roll caused a Critical Injury to its target.</p>
  <button type="button" onclick={() => rollInjury(false)}>ROLL INJURY FOR TARGET</button>
 {/if}
 <button type="button" disabled={full} onclick={() => rollInjury(true)}>ROLL INJURY RECEIVED</button>
 {#if full}<p>All injuries at this location are already active.</p>{/if}
 {#if preview}
  {@const definition = CRITICAL_INJURIES[preview.injury.location][preview.injury.roll]}
  <div class="preview" aria-live="polite">
   <strong>{preview.received ? 'RECEIVED' : 'TARGET'} · {preview.injury.location} · [{preview.dice.join(', ')}] = {preview.injury.roll}: {definition.name}</strong>
   <p>{definition.effect}</p>
   {#if duplicate}
    <p>Already active. Reroll for a different injury; no bonus damage applied yet.</p>
    <button type="button" onclick={() => rollInjury(true)}>REROLL INJURY RECEIVED</button>
   {:else if preview.received}
    <button type="button" onclick={apply}>APPLY TO THIS CHARACTER (−5 HP)</button>
   {:else}
    <p>Target takes 5 bonus damage directly to HP. Reroll if they already have this injury. Record it on their sheet.</p>
    <button type="button" onclick={() => rollInjury(false)}>REROLL FOR TARGET</button>
   {/if}
   <button type="button" onclick={() => preview = null}>DISMISS INJURY ROLL</button>
  </div>
 {/if}
 {#if injuries.length === 0}<p class="dim">No active injuries.</p>{/if}
 <ul>
  {#each injuries as injury (injuryKey(injury))}
   {@const definition = CRITICAL_INJURIES[injury.location][injury.roll]}
   <li>
    <strong>{definition.name} · {injury.location}</strong>
    <p>{definition.effect}</p>
    <button type="button" onclick={() => onchange({ criticalInjuries: injuries.filter((i) => injuryKey(i) !== injuryKey(injury)) })}>TREATED: REMOVE {definition.name}</button>
   </li>
  {/each}
 </ul>
 <p class="dim">All-action, MOVE, base Death Save penalties and Cracked Skull head damage apply automatically. Apply conditional effects above manually. Treatment removes an injury without restoring HP; a temporary Quick Fix usually lasts only the day (Core p. 223).</p>
</Panel>

<style>
 .dim { color: var(--muted); }
 .notice { color: var(--mint); }
 label { display: grid; gap: 0.35rem; }
 select { width: 100%; min-width: 0; background: var(--bg-2); color: var(--value); }
 button, select { min-height: 44px; margin-bottom: 0.4rem; max-width: 100%; }
 button { white-space: normal; }
 ul { list-style: none; padding: 0; }
 li, .preview { border: 1px solid var(--frame); padding: 0.75rem; margin-top: 0.75rem; }
 p { margin: 0.5rem 0 0.75rem; }
</style>
