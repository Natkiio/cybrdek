<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import {
		createCampaign,
		inviteCode,
		inviteLink,
		listCampaigns,
		type CampaignListing
	} from '#lib/campaigns/api.ts';
	import { campaign, switchCampaign } from '#lib/campaigns/current.svelte.ts';
	import { latestOnly } from '#lib/lore/latest.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let campaigns = $state.raw<CampaignListing[]>([]);
	let loaded = $state(false);
	let name = $state('');
	let error = $state('');
	let busy = $state(false);
	let link = $state('');
	let copied = $state(false);

	const latest = latestOnly();

	async function load() {
		const current = latest.begin();
		const [list, code] = await Promise.all([
			listCampaigns(gm.userId),
			gm.isGm ? inviteCode(campaign.id) : Promise.resolve(null)
		]);
		if (!current()) return;
		campaigns = list;
		link = code ? inviteLink(location.origin, code) : '';
		loaded = true;
	}

	// Again whenever sign-in or GM state settles.
	$effect(() => {
		void gm.userId;
		void gm.isGm;
		void load();
	});

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim()) return;
		busy = true;
		const result = await createCampaign(name);
		busy = false;
		if ('error' in result) error = result.error;
		else switchCampaign({ id: result.id, name: name.trim() });
	}

	async function copy() {
		await navigator.clipboard.writeText(link);
		copied = true;
	}

	const roleLabel = (c: CampaignListing) => (c.role === 'gm' ? 'GM' : c.role === 'player' ? 'PLAYER' : 'PUBLIC');
</script>

<svelte:head><title>CAMPAIGNS // CYBRDEK</title></svelte:head>

<h1>CAMPAIGNS</h1>

{#if link}
	<Panel title="INVITE PLAYERS">
		<p class="dim">Anyone with this link can join <strong>{campaign.name}</strong> as a player. They sign in by email.</p>
		<input readonly aria-label="Invite link" value={link} onfocus={(e) => e.currentTarget.select()} />
		<button type="button" onclick={copy}>{copied ? 'COPIED' : 'COPY LINK'}</button>
	</Panel>
{/if}

<Panel title="YOUR CAMPAIGNS">
	{#if !loaded}
		<p class="dim">LOADING…</p>
	{:else if campaigns.length === 0}
		<p class="dim">No campaigns to show. Are you online?</p>
	{:else}
		<ul>
			{#each campaigns as c (c.id)}
				<li>
					<button type="button" aria-pressed={c.id === campaign.id} onclick={() => switchCampaign(c)}>
						<span class="name">{c.name}</span>
						<span class="role">{roleLabel(c)}</span>
						{#if c.id === campaign.id}<span class="on">CURRENT</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Panel>

<Panel title="NEW CAMPAIGN">
	{#if gm.email}
		<form onsubmit={create}>
			<input required maxlength="80" aria-label="Campaign name" placeholder="Campaign name" bind:value={name} />
			<button type="submit" class="go" disabled={busy || !name.trim()}>{busy ? 'CREATING…' : 'CREATE'}</button>
		</form>
		<p class="dim small">You'll be its GM. New campaigns are private: only people you invite can see them.</p>
		{#if error}<p class="error" aria-live="polite">{error}</p>{/if}
	{:else}
		<p class="dim"><a href="/gm">Sign in</a> to create a campaign of your own.</p>
	{/if}
</Panel>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}

	li button {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.6rem;
		width: 100%;
		min-height: 48px;
		text-align: left;
	}

	li button[aria-pressed='true'] {
		border-color: var(--mint-dim);
	}

	.name {
		color: var(--value);
		overflow-wrap: anywhere;
	}

	.role,
	.on {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--label);
	}

	.on {
		color: var(--mint);
		margin-left: auto;
	}

	form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
	}

	input {
		width: 100%;
		min-width: 0;
	}

	input,
	button {
		min-height: 44px;
	}

	strong {
		color: var(--value);
	}

	.go {
		color: var(--mint);
		border-color: var(--mint-dim);
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
	}

	.error {
		color: var(--red-soft);
	}
</style>
