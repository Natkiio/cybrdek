<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Panel from '#lib/components/Panel.svelte';
	import { deleteEntry, listEntries, saveEntry } from '#lib/lore/api.ts';
	import { latestOnly } from '#lib/lore/latest.ts';
	import { backlinks } from '#lib/lore/links.ts';
	import { renderBody } from '#lib/lore/render.ts';
	import { LORE_TYPE_LABELS, type LoreEntry } from '#lib/lore/types.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let entries = $state<LoreEntry[]>([]);
	let loaded = $state(false);
	let offline = $state(false);
	let confirmingDelete = $state(false);
	let busy = $state(false);
	let error = $state('');

	const slug = $derived(page.params.slug ?? '');
	const entry = $derived(entries.find((e) => e.slug === slug));
	const known = $derived(new Set(entries.map((e) => e.slug)));
	const html = $derived(entry ? renderBody(entry.body, known) : '');
	const linkedFrom = $derived(entry ? backlinks(entries, entry.slug) : []);

	const latest = latestOnly();

	async function load() {
		const current = latest.begin();
		const result = await listEntries();
		if (!current()) return; // a newer load (other entry, or GM mode changed) wins
		entries = result.entries;
		offline = result.offline;
		loaded = true;
	}

	// Load on first visit, again when following a [[link]] to another entry,
	// and again when GM mode changes (that changes what RLS returns).
	$effect(() => {
		void slug;
		// Leaving GM mode: hide GM-only rows now, not when the reload finishes.
		if (!gm.isGm) entries = untrack(() => entries).filter((e) => e.visible);
		void load();
	});

	async function toggleVisible() {
		if (!entry) return;
		busy = true;
		const { id, title, type, summary, body, visible } = entry;
		const result = await saveEntry({ title, type, summary, body, visible: !visible }, id);
		busy = false;
		if ('error' in result) error = result.error;
		else entries = entries.map((e) => (e.id === id ? result.entry : e));
	}

	async function remove() {
		if (!entry) return;
		busy = true;
		const problem = await deleteEntry(entry.id);
		busy = false;
		if (problem) error = problem;
		else void goto('/lore');
	}
</script>

<svelte:head>
	<title>{entry?.title ?? 'LORE'} // CYBRDEK</title>
</svelte:head>

<p><a class="back" href="/lore">← LORE</a></p>

{#if offline}<p class="warn">OFFLINE: showing the copy saved on this device.</p>{/if}

{#if !loaded}
	<Panel><p class="dim">LOADING…</p></Panel>
{:else if !entry}
	<Panel title="NOT FOUND"><p class="dim">No entry here, or it hasn't been revealed yet.</p></Panel>
{:else}
	<header>
		<h1>{entry.title}</h1>
		<p class="meta">
			<span class="type">{LORE_TYPE_LABELS[entry.type]}</span>
			{#if !entry.visible}<span class="hidden">GM ONLY</span>{/if}
		</p>
		{#if entry.summary}<p class="summary">{entry.summary}</p>{/if}
	</header>

	{#if gm.isGm}
		<div class="gm-bar">
			<a class="button" href="/lore/{entry.slug}/edit">EDIT</a>
			<button type="button" disabled={busy} onclick={toggleVisible}>
				{entry.visible ? 'HIDE FROM PLAYERS' : 'SHOW TO PLAYERS'}
			</button>
			{#if confirmingDelete}
				<button type="button" class="danger" disabled={busy} onclick={remove}>CONFIRM DELETE</button>
				<button type="button" onclick={() => (confirmingDelete = false)}>KEEP</button>
			{:else}
				<button type="button" class="danger" onclick={() => (confirmingDelete = true)}>DELETE</button>
			{/if}
		</div>
		{#if error}<p class="error" aria-live="polite">{error}</p>{/if}
	{/if}

	{#if entry.body.trim()}
		<Panel>
			<!-- Sanitised by DOMPurify in renderBody. -->
			<div class="body">{@html html}</div>
		</Panel>
	{/if}

	{#if linkedFrom.length}
		<Panel title="LINKED FROM">
			<ul class="links">
				{#each linkedFrom as e (e.id)}
					<li><a href="/lore/{e.slug}">{e.title}</a> <span class="type">{LORE_TYPE_LABELS[e.type]}</span></li>
				{/each}
			</ul>
		</Panel>
	{/if}
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	h1 {
		margin-bottom: 0.25rem;
	}

	.meta {
		display: flex;
		gap: 0.5rem;
		margin: 0 0 0.5rem;
	}

	.type,
	.hidden {
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--label);
	}

	.hidden {
		color: var(--red-soft);
		border: 1px solid var(--red-dim);
		padding: 0.1rem 0.35rem;
	}

	.summary {
		color: var(--muted);
		margin: 0 0 1rem;
	}

	.gm-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}

	.gm-bar > * {
		min-height: 44px;
	}

	.button {
		display: inline-flex;
		align-items: center;
		padding: 0 0.9rem;
		border: 1px solid var(--mint-dim);
		color: var(--mint);
	}

	.danger {
		color: var(--red-soft);
		border-color: var(--red-dim);
	}

	.body {
		line-height: 1.6;
		overflow-wrap: anywhere;
	}

	.body :global(h1),
	.body :global(h2),
	.body :global(h3) {
		color: var(--red);
		font-size: 1rem;
		letter-spacing: 0.08em;
	}

	.body :global(a) {
		color: var(--mint);
		text-decoration: underline;
	}

	.body :global(img) {
		max-width: 100%;
	}

	.body :global(blockquote) {
		margin: 0.5rem 0;
		padding-left: 0.75rem;
		border-left: 2px solid var(--frame-dim);
		color: var(--muted);
	}

	.links {
		margin: 0;
		padding-left: 1.1rem;
	}

	.dim {
		color: var(--muted);
	}

	.warn,
	.error {
		color: var(--red-soft);
	}
</style>
