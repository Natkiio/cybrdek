<script lang="ts">
 import { onMount, untrack } from 'svelte';
 import { architectureSession } from '#lib/net/session.svelte.ts';
 import { newArchitecture, type Architecture, type SavedArchitecture } from '#lib/net/architecture.ts';
 import ArchitectureEditor from './ArchitectureEditor.svelte';
 import SecurityReference from './SecurityReference.svelte';
 let { campaignId }: { campaignId: string } = $props();
 const session = untrack(() => architectureSession(campaignId));
 const net = session.state;
 let editing = $state<{ id: string | null; revision: number; draft: Architecture } | null>(null);
 let confirming = $state('');
 const managed = $derived(net.view?.canManage ? net.view.architectures : []);
 onMount(session.start);
 function edit(a?: SavedArchitecture) {
  editing = { id: a?.id ?? null, revision: a?.revision ?? 0, draft: a ? { name: a.name, gmNotes: a.gmNotes, floors: $state.snapshot(a.floors) } : newArchitecture() };
 }
 async function save(draft: Architecture) {
  if (editing && await session.save(draft, editing.id, editing.revision)) editing = null;
 }
 async function reveal(a: SavedArchitecture, floorId: string) {
  await session.save({ name: a.name, gmNotes: a.gmNotes, floors: a.floors.map(f => f.id === floorId ? { ...f, revealed: !f.revealed } : f) }, a.id, a.revision);
 }
</script>
<p class="dim">Campaign NET Architectures · text view. The GM reveals floors to campaign members.</p>
<button type="button" disabled={net.busy} onclick={() => session.refresh()}>REFRESH ARCHITECTURES</button>
{#if net.error}<p class="error" role="alert">{net.error}</p>{/if}
{#if net.loading}<p>LOADING…</p>{/if}
{#if net.view}
 {#if net.view.canManage}
  <p class="dim">GM view · hidden floors and GM notes are private. No automatic NET combat or Architecture generation.</p>
  <button type="button" disabled={net.busy || !!editing} onclick={() => edit()}>NEW ARCHITECTURE</button>
  {#if editing}
   {#key editing}<ArchitectureEditor initial={editing.draft} busy={net.busy} onsave={save} oncancel={() => editing = null} />{/key}
   {#if editing.id && managed.find(a => a.id === editing!.id)?.revision !== editing.revision}
    <p class="error" role="status">The saved Architecture changed while you were editing. Your draft is retained. Cancel and reopen to use the latest version; saving this older revision will be refused.</p>
   {/if}
  {/if}
 {:else}<p class="dim">Only revealed floors are shown. GM notes are never included.</p>{/if}
 {#if net.view.architectures.length === 0}<p>{net.view.canManage ? 'No Architectures saved yet.' : 'No floors revealed yet.'}</p>{/if}
 {#each net.view.architectures as a (a.id)}
  <section class="architecture" aria-label={a.name}>
   <h2>{a.name}</h2>
   {#if net.view.canManage}
    {@const full = managed.find(m => m.id === a.id)!}
    <p class="notes">GM notes: {full.gmNotes || '—'}</p>
    <div class="actions">
     <button type="button" disabled={net.busy || !!editing} onclick={() => edit(full)}>EDIT ARCHITECTURE</button>
     {#if confirming === a.id}
      <button type="button" disabled={net.busy || !!editing} onclick={async () => { if (await session.remove(a.id, a.revision)) confirming = ''; }}>CONFIRM DELETE ARCHITECTURE</button>
      <button type="button" onclick={() => confirming = ''}>KEEP ARCHITECTURE</button>
     {:else}<button type="button" disabled={net.busy || !!editing} onclick={() => confirming = a.id}>DELETE ARCHITECTURE</button>{/if}
    </div>
   {/if}
   <ol class="floors">
    {#each a.floors as f (f.id)}
     <li>
      <h3>{f.label}</h3>
      {#if net.view.canManage}
       {@const full = managed.find(m => m.id === a.id)!}
       {@const floor = full.floors.find(m => m.id === f.id)!}
       <p class="dim">{floor.revealed ? 'REVEALED' : 'HIDDEN'} · GM notes: {floor.gmNotes || '—'}</p>
       <button type="button" disabled={net.busy || !!editing} onclick={() => reveal(full, f.id)}>{floor.revealed ? 'HIDE FLOOR' : 'REVEAL FLOOR'}: {f.label}</button>
      {/if}
      <ul>{#each f.entries as entry (entry.id)}
       <li><strong>{entry.name}</strong> · {entry.type}{entry.dv !== null ? ` · DV ${entry.dv}` : ''}
        <p class="player-text">{entry.playerText}</p>
        <SecurityReference type={entry.type} refId={entry.refId} />
        {#if net.view.canManage && 'gmNotes' in entry}<p class="notes">GM notes: {entry.gmNotes}</p>{/if}
       </li>
      {/each}</ul>
     </li>
    {/each}
   </ol>
  </section>
 {/each}
{/if}
<style>
 .architecture { border-top: 1px solid var(--frame-dim); margin: 1rem 0; padding-top: 0.5rem; }
 .floors { list-style: none; padding: 0; }
 .floors > li { margin: 1rem 0; border-left: 2px solid var(--frame-dim); padding-left: 0.6rem; }
 ul { padding-left: 1rem; }
 li, h2, h3, .notes, .player-text { overflow-wrap: anywhere; white-space: pre-wrap; }
 .notes, .dim { color: var(--muted); }
 .error { color: var(--red-soft); }
 h2, h3, strong { color: var(--value); }
 button { min-height: 44px; }
 .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
</style>
