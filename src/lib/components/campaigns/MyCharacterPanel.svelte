<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import { listMyCharacters, setCharacterCampaign, type MyCharacter } from '#lib/campaigns/party.ts';
	import { syncCharacters } from '#lib/sync/characters.svelte.ts';

	let { userId, campaignId, campaignName }: { userId: string; campaignId: string; campaignName: string } = $props();

	let characters = $state.raw<MyCharacter[]>([]);
	let loaded = $state(false);
	let busy = $state(false);
	let error = $state('');

	const playing = $derived(characters.filter((c) => c.campaignId === campaignId));
	const others = $derived(characters.filter((c) => c.campaignId !== campaignId));

	// Only the newest request may change what's shown, so a slow reply meant for
	// an earlier account or campaign can never land on this one.
	let request = 0;

	async function load() {
		const mine = ++request;
		// A character made a moment ago may not have gone up yet.
		await syncCharacters();
		if (mine !== request) return;
		const result = await listMyCharacters(userId);
		if (mine !== request) return;
		if ('error' in result) error = result.error;
		else {
			characters = result;
			error = '';
		}
		loaded = true;
	}

	async function place(id: string, campaign: string | null) {
		const mine = request;
		busy = true;
		const problem = await setCharacterCampaign(id, campaign);
		if (mine !== request) return; // the account or campaign changed meanwhile
		busy = false;
		if (problem) error = problem;
		else await load();
	}

	$effect(() => {
		void userId;
		void campaignId;
		// Nothing from the last account stays on screen while this one loads.
		characters = [];
		loaded = false;
		error = '';
		busy = false;
		void load();
	});
</script>

<Panel title="YOUR CHARACTER">
	{#if !loaded}
		<p class="dim">LOADING…</p>
	{:else if characters.length === 0}
		<p class="dim">
			You have no characters in your account yet. <a href="/characters/new">Make one</a>, or move one in from
			<a href="/characters">CHARS</a>.
		</p>
	{:else}
		{#each playing as character (character.id)}
			<div class="row">
				<span class="name">{character.name}</span>
				<button type="button" disabled={busy} onclick={() => place(character.id, null)}>TAKE OUT</button>
			</div>
		{/each}
		{#if playing.length === 0}<p class="dim">Pick who you're playing in {campaignName}. Your GM will see their sheet. Other players won't.</p>{/if}
		{#each others as character (character.id)}
			<div class="row">
				<span>{character.name}</span>
				<button type="button" class="go" disabled={busy} onclick={() => place(character.id, campaignId)}>PLAY THIS CHARACTER</button>
			</div>
		{/each}
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</Panel>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	button {
		min-height: 44px;
	}

	.name,
	.go {
		color: var(--mint);
	}

	.go {
		border-color: var(--mint-dim);
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red-soft);
	}
</style>
