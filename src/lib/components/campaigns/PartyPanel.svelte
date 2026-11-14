<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import { listParty, type PartyMember } from '#lib/campaigns/party.ts';

	let { campaignId }: { campaignId: string } = $props();

	let party = $state.raw<PartyMember[]>([]);
	let loaded = $state(false);
	let busy = $state(false);
	let error = $state('');

	// Only the newest request may change what's shown (see MyCharacterPanel).
	let request = 0;

	async function load() {
		const mine = ++request;
		busy = true;
		const result = await listParty(campaignId);
		if (mine !== request) return;
		if ('error' in result) error = result.error;
		else {
			party = result;
			error = '';
		}
		loaded = true;
		busy = false;
	}

	$effect(() => {
		void campaignId;
		party = [];
		loaded = false;
		error = '';
		void load();
	});
</script>

<Panel title="THE PARTY">
	{#if !loaded}
		<p class="dim">LOADING…</p>
	{:else if party.length === 0 && !error}
		<p class="dim">No characters yet. They appear here once players join and pick one.</p>
	{:else}
		<ul>
			{#each party as member (member.key)}
				<li>
					<span class="name">{member.name}</span>
					<span class="dim">{member.role} {member.rank}</span>
					<span>HP {member.hp}/{member.maxHp}</span>
					<span>{member.ip} IP</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<p class="actions">
		<button type="button" disabled={busy} onclick={load}>REFRESH</button>
		<a href="/campaigns/party">OPEN LIVE DASHBOARD →</a>
	</p>
</Panel>

<style>
	ul {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}

	button {
		min-height: 44px;
	}

	.name {
		color: var(--mint);
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red-soft);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
</style>
