<script lang="ts">
	import MyCharacterPanel from '#lib/components/campaigns/MyCharacterPanel.svelte';
	import PartyPanel from '#lib/components/campaigns/PartyPanel.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import {
		campaignDisplayName,
		setCampaignDisplayName,
		createCampaign,
		inviteCode,
		inviteLink,
		listCampaigns,
		type CampaignListing
	} from '#lib/campaigns/api.ts';
	import { campaign, switchCampaign } from '#lib/campaigns/current.svelte.ts';
	import { latestOnly } from '#lib/lore/latest.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';
	import { playersUploadMaps, setPlayersUploadMaps } from '#lib/map/campaign-maps.ts';
	import { onMount } from 'svelte';

	let campaigns = $state.raw<CampaignListing[]>([]);
	let loaded = $state(false);
	let name = $state('');
	let error = $state('');
	let busy = $state(false);
	let link = $state('');
	let copied = $state(false);
	let displayName = $state<string | null>(null);
	let displayNameError = $state('');
	let displayNameSaved = $state(false);
	let savingDisplayName = $state(false);
	let mapUploads = $state<boolean | null>(null); // null: unknown or not the GM
	let mapUploadsError = $state('');

	const latest = latestOnly();

	async function load() {
		const current = latest.begin();
		const [list, code, memberName, uploads] = await Promise.all([
			listCampaigns(gm.userId),
			gm.isGm ? inviteCode(campaign.id) : Promise.resolve(null),
			gm.userId ? campaignDisplayName(campaign.id, gm.userId) : Promise.resolve(null),
			gm.isGm ? playersUploadMaps(campaign.id) : Promise.resolve(null)
		]);
		if (!current()) return;
		mapUploads = uploads;
		displayName = memberName;
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

	async function saveDisplayName(event: SubmitEvent) {
		event.preventDefault();
		if (!displayName?.trim()) return;
		savingDisplayName = true;
		displayNameSaved = false;
		displayNameError = await setCampaignDisplayName(campaign.id, displayName) ?? '';
		savingDisplayName = false;
		displayNameSaved = !displayNameError;
	}

	async function copy() {
		await navigator.clipboard.writeText(link);
		copied = true;
	}

	const myRole = $derived(campaigns.find((c) => c.id === campaign.id)?.role ?? null);
	// The GM flag can be known before the list loads; it decides the header too.
	const here = $derived(gm.isGm ? 'gm' : myRole);

	let savingMapUploads = $state(false);
	/** Save the map-upload permission; on failure the box goes back to the saved value. */
	async function toggleMapUploads(box: HTMLInputElement) {
		const allowed = box.checked;
		savingMapUploads = true; // locked until the reply, so replies can't arrive out of order
		mapUploadsError = (await setPlayersUploadMaps(campaign.id, allowed)) ?? '';
		savingMapUploads = false;
		if (mapUploadsError) box.checked = mapUploads ?? false;
		else mapUploads = allowed;
	}

	// Phone: THIS CAMPAIGN and ALL CAMPAIGNS are tabs (#all in the address).
	// Laptop: both side by side, so there's nothing to switch.
	type View = 'this' | 'all';
	let view = $state<View>('this');
	let wide = $state(false);
	onMount(() => {
		if (location.hash === '#all') view = 'all';
		const query = matchMedia('(min-width: 1000px)');
		const sync = () => (wide = query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});
	function show(next: View) {
		view = next;
		try {
			history.replaceState(history.state, '', next === 'all' ? '#all' : location.pathname + location.search);
		} catch {
			// no history API: the tab just isn't remembered
		}
	}

	const TOOLS = [
		{ href: '/combat', icon: '⚔', label: 'COMBAT' },
		{ href: '/net', icon: '◆', label: 'NET' },
		{ href: '/map', icon: '▦', label: 'MAP' },
		{ href: '/lore', icon: '≡', label: 'LORE' },
		{ href: '/campaigns/party', icon: '◉', label: 'PARTY' }
	];

	const roleLabel = (c: CampaignListing) => (c.role === 'gm' ? 'GM' : c.role === 'player' ? 'PLAYER' : 'PUBLIC');
</script>

<svelte:head><title>CAMPAIGNS // CYBRDEK</title></svelte:head>

<h1>CAMPAIGNS</h1>

<!-- Campaign HQ (#103): the campaign you're in first, with what you can do in
     it; switching and starting campaigns are a tab away on a phone, and the
     second column on a laptop. -->
<section class="hero" aria-label="Current campaign">
	<span class="eyebrow">{here ? "YOU'RE IN" : "YOU'RE BROWSING"}</span>
	<div class="hero-row">
		<h2>{campaign.name}</h2>
		{#if here}<span class="badge" class:gm={here === 'gm'}>{here === 'gm' ? 'GM' : 'PLAYER'}</span>{/if}
	</div>
	{#if !gm.userId}
		<p class="dim small"><a href="/account">Sign in</a> to join a campaign with an invite link, or start your own.</p>
	{:else if loaded && !here}
		<p class="dim small">You're not in this campaign. Join one with its GM's invite link, or switch to one of yours.</p>
	{/if}
</section>

{#if !wide}
	<!-- Plain view switches (not an ARIA tab widget): Tab and Enter, like any button. -->
	<div class="tabs" role="group" aria-label="Show">
		<button type="button" aria-pressed={view === 'this'} onclick={() => show('this')}>THIS CAMPAIGN</button>
		<button type="button" aria-pressed={view === 'all'} onclick={() => show('all')}>ALL CAMPAIGNS</button>
	</div>
{/if}

<div class="hq">
	{#if wide || view === 'this'}
		<div class="col">
			{#if here === 'gm'}
				<Panel title="RUN THE GAME">
					<nav class="tools" aria-label="Game tools">
						{#each TOOLS as t (t.href)}
							<a href={t.href}><i aria-hidden="true">{t.icon}</i>{t.label}</a>
						{/each}
					</nav>
				</Panel>
			{/if}

			{#if link}
				<Panel title="INVITE PLAYERS">
					<p class="dim">Anyone with this link can join <strong>{campaign.name}</strong> as a player. They create an account to join.</p>
					<div class="copy">
						<input readonly aria-label="Invite link" value={link} onfocus={(e) => e.currentTarget.select()} />
						<button type="button" class="go" onclick={copy}>{copied ? 'COPIED' : 'COPY LINK'}</button>
					</div>
				</Panel>
			{/if}

			{#if gm.isGm}
				<!-- Keyed: a new account or campaign gets a fresh panel, never the last one's contents. -->
				{#key `${gm.userId}:${campaign.id}`}<PartyPanel campaignId={campaign.id} />{/key}
			{:else if gm.userId && myRole === 'player'}
				{#key `${gm.userId}:${campaign.id}`}
					<MyCharacterPanel userId={gm.userId} campaignId={campaign.id} campaignName={campaign.name} />
				{/key}
			{/if}

			{#if gm.userId && displayName !== null}
				<Panel title="YOUR NAME AT THIS TABLE">
					<p class="dim small">Choose the name campaign members see beside your rolls.</p>
					<form onsubmit={saveDisplayName}>
						<input required maxlength="80" aria-label="Campaign display name" bind:value={displayName} oninput={() => (displayNameSaved = false)} />
						<button type="submit" class="go" disabled={savingDisplayName || !displayName.trim()}>{savingDisplayName ? 'SAVING…' : 'SAVE NAME'}</button>
					</form>
					{#if displayNameError}<p class="error" role="status">{displayNameError}</p>{/if}
					{#if displayNameSaved}<p class="dim" role="status">Name saved.</p>{/if}
				</Panel>
			{/if}

			{#if gm.isGm && mapUploads !== null}
				<Panel title="SETTINGS">
					<label class="setting">
						<input type="checkbox" checked={mapUploads} disabled={savingMapUploads} onchange={(e) => toggleMapUploads(e.currentTarget)} />
						Players can upload maps
					</label>
					{#if mapUploadsError}<p class="error" role="status">{mapUploadsError}</p>{/if}
				</Panel>
			{/if}
		</div>
	{/if}

	{#if wide || view === 'all'}
		<div class="col">
			<Panel title={wide ? 'ALL CAMPAIGNS' : 'SWITCH CAMPAIGN'}>
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

			<Panel title="START A CAMPAIGN">
				{#if gm.email}
					<form onsubmit={create}>
						<input required maxlength="80" aria-label="Campaign name" placeholder="Campaign name" bind:value={name} />
						<button type="submit" class="go" disabled={busy || !name.trim()}>{busy ? 'CREATING…' : 'CREATE'}</button>
					</form>
					<p class="dim small">You'll be its GM. New campaigns are private: only people you invite can see them.</p>
					{#if error}<p class="error" aria-live="polite">{error}</p>{/if}
				{:else}
					<p class="dim"><a href="/account">Sign in</a> to create a campaign of your own.</p>
				{/if}
			</Panel>
		</div>
	{/if}
</div>

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
		border-color: var(--bright-dim);
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
		color: var(--bright);
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
		color: var(--bright);
		border-color: var(--bright-dim);
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

	/* The campaign you're in, framed in red so it reads as "here". */
	.hero {
		display: grid;
		gap: 0.4rem;
		border: 1px solid var(--red);
		background: linear-gradient(135deg, color-mix(in srgb, var(--red) 10%, transparent), transparent 60%), var(--bg-1);
		padding: 0.9rem 1rem;
		margin-bottom: 1rem;
	}

	.eyebrow {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.16em;
		color: var(--muted);
	}

	.hero-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
	}

	.hero h2 {
		margin: 0;
		font-size: 1.15rem;
		color: var(--bright);
		overflow-wrap: anywhere;
	}

	.badge {
		font-family: var(--f-label);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		border: 1px solid var(--frame-dim);
		padding: 0.2rem 0.45rem;
		color: var(--label);
	}

	.badge.gm {
		color: var(--red);
		border-color: var(--red);
	}

	.tabs {
		display: flex;
		border-bottom: 1px solid var(--frame-dim);
		margin-bottom: 1rem;
	}

	.tabs button {
		flex: 1;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		box-shadow: none;
	}

	.tabs button[aria-pressed='true'] {
		color: var(--red);
		border-bottom-color: var(--red);
	}

	.tabs button:focus-visible {
		outline: 1px dashed var(--bright);
		outline-offset: -4px;
	}

	.hq {
		display: grid;
		gap: 0 clamp(1rem, 3vw, 2.5rem);
		align-items: start;
	}

	.col {
		min-width: 0;
	}

	@media (min-width: 1000px) {
		.hq {
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		}
	}

	.tools {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.4rem;
	}

	.tools a {
		display: grid;
		place-items: center;
		gap: 0.15rem;
		min-height: 3.5rem;
		border: 1px solid var(--frame-dim);
		background: var(--bg-2);
		font-family: var(--f-label);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		color: var(--value);
		text-decoration: none;
	}

	.tools a:hover,
	.tools a:focus-visible {
		border-color: var(--frame);
	}

	.tools i {
		font-style: normal;
		font-family: var(--f-mono);
		font-size: 1rem;
		color: var(--red);
	}

	.copy {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
	}

	.setting {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}

	.setting input {
		width: auto;
		min-height: auto;
	}
</style>
