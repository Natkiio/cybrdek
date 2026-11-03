<script lang="ts">
	import { goto } from '$app/navigation';
	import Panel from '#lib/components/Panel.svelte';
	import LoreEditor from '#lib/components/lore/LoreEditor.svelte';
	import { saveEntry } from '#lib/lore/api.ts';
	import type { LoreDraft } from '#lib/lore/types.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let saving = $state(false);
	let error = $state('');

	async function save(draft: LoreDraft) {
		saving = true;
		const result = await saveEntry(draft);
		saving = false;
		if ('error' in result) error = result.error;
		else void goto(`/lore/${result.entry.slug}`);
	}
</script>

<svelte:head>
	<title>NEW ENTRY // CYBRDEK</title>
</svelte:head>

<p><a class="back" href="/lore">← LORE</a></p>
<h1>NEW ENTRY</h1>

{#if !gm.ready}
	<Panel><p class="dim">CHECKING…</p></Panel>
{:else if !gm.isGm}
	<Panel><p class="dim">Only the GM can write lore. <a href="/gm">Sign in</a>.</p></Panel>
{:else}
	<LoreEditor
		initial={{ title: '', type: 'location', summary: '', body: '', visible: false }}
		{saving}
		{error}
		onsave={save}
		oncancel={() => goto('/lore')}
	/>
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
