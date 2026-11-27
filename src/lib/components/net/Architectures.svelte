<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { architectureSession } from '#lib/net/session.svelte.ts';
	import {
		newArchitecture,
		type Architecture,
		type SavedArchitecture
	} from '#lib/net/architecture.ts';
	import FloorIndex from './FloorIndex.svelte';
	import ArchitectureEditor from './ArchitectureEditor.svelte';
	import SecurityReference from './SecurityReference.svelte';
	let { campaignId }: { campaignId: string } = $props();
	const session = untrack(() => architectureSession(campaignId));
	const net = session.state;
	let editing = $state<{ id: string | null; revision: number; draft: Architecture } | null>(null);
	let confirming = $state('');
	const id = $props.id();
	let headerHeight = $state(0);
	onMount(() => {
		const header = document.querySelector('header.bar');
		if (!header) return;
		const measure = () => headerHeight = header.getBoundingClientRect().height;
		const observer = new ResizeObserver(measure);
		observer.observe(header);
		measure();
		return () => observer.disconnect();
	});
	const managed = $derived(net.view?.canManage ? net.view.architectures : []);
	onMount(session.start);
	function edit(a?: SavedArchitecture) {
		editing = {
			id: a?.id ?? null,
			revision: a?.revision ?? 0,
			draft: a
				? { name: a.name, gmNotes: a.gmNotes, floors: $state.snapshot(a.floors) }
				: newArchitecture()
		};
	}
	async function save(draft: Architecture) {
		if (editing && (await session.save(draft, editing.id, editing.revision))) editing = null;
	}
	async function reveal(a: SavedArchitecture, floorId: string) {
		await session.save(
			{
				name: a.name,
				gmNotes: a.gmNotes,
				floors: a.floors.map((f) => (f.id === floorId ? { ...f, revealed: !f.revealed } : f))
			},
			a.id,
			a.revision
		);
	}
</script>

<div class="architectures wide-page" style:--net-header-height="{headerHeight}px">
{#snippet refresh()}
	<button type="button" disabled={net.busy} onclick={() => session.refresh()}>REFRESH ARCHITECTURES</button>
{/snippet}
{#if net.error}<p class="error" role="alert">{net.error}</p>{/if}
{#if net.loading}<p>LOADING…</p>{/if}
{#if net.view}
	{#if net.view.canManage}
		<div class="page-actions">
			<span class="mode">GM VIEW</span>
			<button class="primary" type="button" disabled={net.busy || !!editing} onclick={() => edit()}>NEW ARCHITECTURE</button>
			{@render refresh()}
		</div>
		<p class="dim hint">Hidden floors and GM notes stay private.</p>
		{#if editing}
			{#key editing}<ArchitectureEditor initial={editing.draft} busy={net.busy} onsave={save} oncancel={() => editing = null} />{/key}
			{#if editing.id && managed.find((a) => a.id === editing!.id)?.revision !== editing.revision}
				<p class="error" role="status">The saved Architecture changed while you were editing. Your draft is retained. Cancel and reopen to use the latest version; saving this older revision will be refused.</p>
			{/if}
		{/if}
	{/if}
	{#if net.view.architectures.length === 0}<p>{net.view.canManage ? 'No Architectures saved yet.' : 'No floors revealed yet.'}</p>{/if}
	{#each net.view.architectures as a (a.id)}
		{@const full = managed.find(m => m.id === a.id)}
		{@const prefix = `${id}-${a.id}`}
		<section class="architecture" aria-label={a.name}>
			<div class="architecture-head">
				<div><h2>{a.name}</h2>
					<p class="count">{#if full}{full.floors.filter(f => f.revealed).length} / {full.floors.length} floors revealed{:else}{a.floors.length} revealed {a.floors.length === 1 ? 'floor' : 'floors'}{/if}</p>
				</div>
				{#if full}<button type="button" disabled={net.busy || !!editing} onclick={() => edit(full)}>EDIT ARCHITECTURE</button>{/if}
			</div>
			{#if full?.gmNotes.trim()}<p class="notes">GM notes: {full.gmNotes}</p>{/if}
			{#if !a.floors.length}<p class="dim">No floors yet. Edit this Architecture to add one.</p>{/if}
			<div class="floor-layout">
				<FloorIndex floors={a.floors} {prefix} name={a.name} player={!net.view.canManage} />
				<ol class="floors">
					{#each a.floors as f, i (f.id)}
						{@const floor = full?.floors.find(m => m.id === f.id)}
						<li class="floor" id="{prefix}-{f.id}" tabindex="-1">
							<div class="floor-head">
								<div class="floor-title"><span class="number">{net.view.canManage ? 'FLOOR' : 'REVEALED FLOOR'} {String(i + 1).padStart(2, '0')}</span><h3>{f.label}</h3></div>
								{#if full && floor}
									<div class="visibility" role="group" aria-label="Visibility of {f.label}">
										<span class="badge" class:revealed={floor.revealed}>{floor.revealed ? 'REVEALED' : 'HIDDEN'}</span>
										<button type="button" aria-label="{floor.revealed ? 'HIDE FLOOR' : 'REVEAL FLOOR'}: {f.label}" disabled={net.busy || !!editing} onclick={() => reveal(full, f.id)}>{floor.revealed ? 'HIDE FLOOR' : 'REVEAL FLOOR'}</button>
									</div>
								{/if}
							</div>
							{#if floor?.gmNotes.trim()}<p class="notes">GM notes: {floor.gmNotes}</p>{/if}
							<ul class="entries">
								{#each f.entries as entry (entry.id)}
									<li class="entry">
										<div class="entry-head"><strong>{entry.name}</strong><span class="type">{entry.type.replaceAll('-', ' ')}</span>{#if net.view.canManage && 'dv' in entry && entry.dv !== null}<span class="dv">DV {entry.dv}</span>{/if}</div>
										{#if entry.playerText.trim()}<p class="player-text">{entry.playerText}</p>{/if}
										<SecurityReference type={entry.type} refId={entry.refId} compact />
										{#if net.view.canManage && 'gmNotes' in entry && entry.gmNotes.trim()}<p class="notes">GM notes: {entry.gmNotes}</p>{/if}
									</li>
								{/each}
							</ul>
							{#if !f.entries.length}<p class="dim hint">No entries on this floor.</p>{/if}
						</li>
					{/each}
				</ol>
			</div>
			{#if full}
				<details class="manage" ontoggle={(e) => { if (!e.currentTarget.open && confirming === a.id) confirming = ''; }}>
					<summary>MANAGE ARCHITECTURE</summary>
					<p class="dim">Deleting an Architecture removes all its floors and entries.</p>
					<div class="actions">
						{#if confirming === a.id}
							<button class="danger" type="button" disabled={net.busy || !!editing} onclick={async () => { if (await session.remove(a.id, a.revision)) confirming = ''; }}>CONFIRM DELETE ARCHITECTURE</button>
							<button type="button" onclick={() => confirming = ''}>KEEP ARCHITECTURE</button>
						{:else}
							<button class="danger" type="button" disabled={net.busy || !!editing} onclick={() => confirming = a.id}>DELETE ARCHITECTURE</button>
						{/if}
					</div>
				</details>
			{/if}
		</section>
	{/each}
	{#if !net.view.canManage}<div class="page-actions">{@render refresh()}</div><p class="dim hint">Only revealed floors are shown. GM notes are never included.</p>{/if}
{:else}
	{@render refresh()}
{/if}
</div>

<style>
	.architectures { max-width: 85rem; }
	.page-actions, .architecture-head, .floor-head, .visibility, .entry-head, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
	.page-actions { margin: 0.75rem 0; }
	.mode, .number, .type, .badge { font-family: var(--f-label); font-size: 0.6rem; letter-spacing: 0.08em; }
	.mode, .type { color: var(--label); }
	.architecture { border-top: 1px solid var(--frame-dim); margin: 1rem 0 1.5rem; padding-top: 0.75rem; }
	.architecture-head { align-items: start; justify-content: space-between; margin-bottom: 0.75rem; }
	h2, h3 { color: var(--bright); margin: 0; overflow-wrap: anywhere; }
	h2 { font-size: 1.25rem; }
	.count { margin: 0.35rem 0 0; color: var(--value); }
	.floor-layout { display: grid; gap: 0 1.5rem; align-items: start; }
	.floors, .entries { list-style: none; padding: 0; margin: 0; min-width: 0; }
	.floors { display: grid; gap: 0.65rem; }
	.floor { border: 1px solid var(--frame-dim); border-left: 2px solid var(--red); padding: 0.65rem; min-width: 0; scroll-margin-top: calc(var(--net-header-height, 4rem) + 1rem); }
	.floor:focus { outline: 2px solid var(--bright); outline-offset: 2px; }
	.floor-head { justify-content: space-between; align-items: start; gap: 0.5rem 1rem; }
	.floor-title { flex: 1; min-width: 8rem; }
	.number { display: block; color: var(--red); margin-bottom: 0.35rem; }
	h3 { font-size: 1rem; }
	.visibility { gap: 0.35rem; }
	.badge { padding: 0.4rem 0.5rem; color: var(--red-soft); border: 1px dashed var(--red-dim); background: var(--bg-1); }
	.badge.revealed { color: var(--bg-0); background: var(--bright); border: 1px solid var(--bright); }
	.entry { padding: 0.6rem 0; border-top: 1px solid var(--frame-dim); }
	.entries { margin-top: 0.6rem; }
	.entry:last-child { padding-bottom: 0; }
	.entry-head { align-items: baseline; }
	strong { color: var(--value); }
	.dv { color: var(--red-soft); font-size: 0.85rem; }
	.notes, .player-text { margin: 0.45rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
	.notes, .dim { color: var(--muted); }
	.hint { font-size: 0.85rem; }
	.error { color: var(--red-soft); }
	.manage { margin-top: 0.75rem; border-top: 1px solid var(--frame-dim); padding-top: 0.35rem; }
	summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; color: var(--label); font-family: var(--f-label); font-size: 0.65rem; letter-spacing: 0.08em; }
	button { min-height: 44px; min-width: 44px; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
	.primary { color: var(--ink-on-red); background: var(--red); border-color: var(--red); }
	.danger { color: var(--red-soft); border-color: var(--red-dim); }
	.architecture-head > div, .entry-head { min-width: 0; overflow-wrap: anywhere; }
	@media (min-width: 1000px) { .floor-layout:has(> :global(nav)) { grid-template-columns: 13rem minmax(0, 1fr); } }
</style>
