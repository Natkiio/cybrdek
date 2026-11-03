<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { listEntries } from '#lib/lore/api.ts';
	import { searchEntries } from '#lib/lore/links.ts';
	import { LORE_TYPE_LABELS, LORE_TYPES, type LoreEntry, type LoreType } from '#lib/lore/types.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let entries = $state<LoreEntry[]>([]);
	let loaded = $state(false);
	let offline = $state(false);
	let query = $state('');
	let type = $state<LoreType | 'all'>('all');

	const shown = $derived(searchEntries(entries, query, type));

	async function load() {
		const result = await listEntries();
		entries = result.entries;
		offline = result.offline;
		loaded = true;
	}

	onMount(load);

	// Signing in or out changes what RLS returns, so fetch again.
	let lastGm: boolean | undefined;
	$effect(() => {
		const now = gm.isGm;
		if (lastGm !== undefined && now !== lastGm) void load();
		lastGm = now;
	});
</script>

<svelte:head>
	<title>LORE // CYBRDEK</title>
</svelte:head>

<div class="head">
	<h1>LORE DATABASE</h1>
	{#if gm.isGm}<a class="button new" href="/lore/new">+ NEW ENTRY</a>{/if}
</div>

{#if offline}<p class="warn">OFFLINE: showing the copy saved on this device.</p>{/if}

<div class="filters">
	<input type="search" placeholder="Search lore…" aria-label="Search lore" bind:value={query} />
	<div class="types" role="group" aria-label="Filter by type">
		<button type="button" class:on={type === 'all'} onclick={() => (type = 'all')}>ALL</button>
		{#each LORE_TYPES as t (t)}
			<button type="button" class:on={type === t} onclick={() => (type = t)}>{LORE_TYPE_LABELS[t]}</button>
		{/each}
	</div>
</div>

{#if !loaded}
	<Panel><p class="dim">LOADING…</p></Panel>
{:else if entries.length === 0}
	<Panel>
		<p class="dim">
			{gm.isGm ? 'No lore yet. Write the first entry.' : 'No lore has been revealed yet, choom.'}
		</p>
	</Panel>
{:else if shown.length === 0}
	<Panel><p class="dim">Nothing matches.</p></Panel>
{:else}
	<ul class="entries">
		{#each shown as e (e.id)}
			<li>
				<a href="/lore/{e.slug}">
					<span class="title">{e.title}</span>
					<span class="type">{LORE_TYPE_LABELS[e.type]}</span>
					{#if !e.visible}<span class="hidden">GM ONLY</span>{/if}
					{#if e.summary}<span class="summary">{e.summary}</span>{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.button {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.9rem;
		border: 1px solid var(--mint-dim);
		color: var(--mint);
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
	}

	.filters {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	input {
		width: 100%;
		min-height: 44px;
	}

	.types {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.types button {
		min-height: 36px;
		font-size: 0.7rem;
	}

	.types button.on {
		color: var(--red);
		border-color: var(--red);
	}

	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}

	.entries a {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.6rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--frame-dim);
		border-left: 2px solid var(--frame);
		background: var(--bg-1);
		color: var(--value);
	}

	.entries a:hover,
	.entries a:focus-visible {
		border-color: var(--frame);
	}

	.title {
		font-size: 1.05rem;
	}

	.type,
	.hidden {
		font-family: var(--f-label);
		font-size: 0.55rem;
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
		flex-basis: 100%;
		color: var(--muted);
	}

	.dim {
		color: var(--muted);
	}

	.warn {
		color: var(--red-soft);
	}
</style>
