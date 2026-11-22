<script lang="ts">
 import { BLACK_ICE, DEMONS } from '#lib/rulesets/red/net-security.ts';
 import { ENTRY_TYPES, newEntry, type NetFloor, type EntryType } from '#lib/net/architecture.ts';
 import SecurityReference from './SecurityReference.svelte';
 let { floor = $bindable() }: { floor: NetFloor } = $props();
 let type = $state<EntryType>('password');
</script>
<label>Floor label <input aria-label="Floor label" maxlength="100" bind:value={floor.label} /></label>
<label><input type="checkbox" bind:checked={floor.revealed} /> Reveal this floor to members when saved</label>
<label>Floor GM notes <textarea maxlength="4000" bind:value={floor.gmNotes}></textarea></label>
{#each floor.entries as entry, i (entry.id)}
 <fieldset class="entry">
  <legend>{entry.type}</legend>
  <label>Entry name <input maxlength="100" bind:value={entry.name} /></label>
  {#if entry.type === 'black-ice' || entry.type === 'demon'}
   <label>Security reference <select bind:value={entry.refId} onchange={e => {
    const catalog = entry.type === 'black-ice' ? BLACK_ICE : DEMONS;
    const def = catalog.find(d => d.id === e.currentTarget.value);
    if (def && catalog.some(d => d.name === entry.name)) entry.name = def.name;
   }}>
    {#each entry.type === 'black-ice' ? BLACK_ICE : DEMONS as def}<option value={def.id}>{def.name}</option>{/each}
   </select></label>
   <SecurityReference type={entry.type} refId={entry.refId} />
  {:else}
   <label>DV (optional) <input type="number" min="0" max="99" value={entry.dv ?? ''} oninput={e => entry.dv = e.currentTarget.value === '' ? null : e.currentTarget.valueAsNumber} /></label>
  {/if}
  <label>Player text <textarea maxlength="2000" bind:value={entry.playerText}></textarea></label>
  <label>Entry GM notes <textarea maxlength="4000" bind:value={entry.gmNotes}></textarea></label>
  <button type="button" onclick={() => floor.entries = floor.entries.filter((_, index) => index !== i)}>REMOVE ENTRY</button>
 </fieldset>
{/each}
<div class="actions">
 <label>Entry type <select bind:value={type}>{#each ENTRY_TYPES as t}<option value={t}>{t}</option>{/each}</select></label>
 <button type="button" disabled={floor.entries.length >= 20} onclick={() => floor.entries = [...floor.entries, newEntry(crypto.randomUUID(), type)]}>ADD ENTRY</button>
</div>
<style>
 label { display: grid; gap: 0.3rem; margin: 0.6rem 0; }
 input:not([type='checkbox']), textarea, select { width: 100%; min-width: 0; }
 input, select, button { min-height: 44px; }
 textarea { min-height: 70px; }
 .entry { min-width: 0; border: 1px solid var(--frame-dim); margin: 1rem 0; }
 .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; }
</style>
