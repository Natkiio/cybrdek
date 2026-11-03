<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Panel from '#lib/components/Panel.svelte';
	import LoreEditor from '#lib/components/lore/LoreEditor.svelte';
	import { listEntries, saveEntry } from '#lib/lore/api.ts';
	import type { LoreDraft, LoreEntry } from '#lib/lore/types.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let entry = $state<LoreEntry | undefined>(undefined);
	let loaded = $state(false);
	let saving = $state(false);
	let error = $state('');

	onMount(async () => {
		const { entries } = await listEntries();
		entry = entries.find((e) => e.slug === page.params.slug);
		loaded = true;
	});

	async function save(draft: LoreDraft) {
		if (!entry) return;
		saving = true;
		const result = await saveEntry(draft, entry.id);
		saving = false;
		if ('error' in result) error = result.error;
		else void goto(`/lore/${result.entry.slug}`);
	}
</script>

<svelte:head>
	<title>EDIT {entry?.title ?? ''} // CYBRDEK</title>
</svelte:head>

<p><a class="back" href="/lore/{page.params.slug}">← BACK</a></p>
<h1>EDIT ENTRY</h1>

{#if !loaded || !gm.ready}
	<Panel><p class="dim">LOADING…</p></Panel>
{:else if !gm.isGm}
	<Panel><p class="dim">Only the GM can edit lore. <a href="/gm">Sign in</a>.</p></Panel>
{:else if !entry}
	<Panel><p class="dim">That entry doesn't exist.</p></Panel>
{:else}
	{#key entry.id}
		<LoreEditor
			initial={{ title: entry.title, type: entry.type, summary: entry.summary, body: entry.body, visible: entry.visible }}
			{saving}
			{error}
			onsave={save}
			oncancel={() => goto(`/lore/${entry?.slug}`)}
		/>
	{/key}
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	.dim {
		color: var(--muted);
	}
</style>
