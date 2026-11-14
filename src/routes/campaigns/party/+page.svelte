<script lang="ts">
	// Live GM dashboard (#53): every character in this campaign, kept current.
	// Only the campaign's GM gets rows back (row-level security); everyone else
	// is told so and receives nothing.
	import Panel from '#lib/components/Panel.svelte';
	import RollLog from '#lib/components/RollLog.svelte';
	import PartyCharacter from '#lib/components/campaigns/PartyCharacter.svelte';
	import { campaign } from '#lib/campaigns/current.svelte.ts';
	import { listParty, type PartyMember } from '#lib/campaigns/party.ts';
	import { watchParty } from '#lib/campaigns/live-party.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	const KEY_STATS = ['REF', 'DEX', 'BODY', 'WILL', 'COOL', 'MOVE'];

	let party = $state.raw<PartyMember[]>([]);
	let loaded = $state(false);
	let error = $state('');
	let updatedAt = $state<Date | null>(null);
	let open = $state<string | null>(null);

	// Only the newest request may change what's shown (see MyCharacterPanel).
	let request = 0;
	let queued: ReturnType<typeof setTimeout> | undefined;

	async function load(campaignId: string) {
		const mine = ++request;
		const result = await listParty(campaignId);
		if (mine !== request) return;
		if ('error' in result) error = result.error;
		else {
			party = result;
			error = '';
			updatedAt = new Date();
		}
		loaded = true;
	}

	$effect(() => {
		const campaignId = campaign.id;
		const allowed = gm.ready && gm.isGm && gm.userId !== null;
		void gm.userId; // a new account starts fresh
		request++;
		party = [];
		loaded = false;
		error = '';
		open = null;
		if (!allowed) return;
		// A burst of saves (a player typing) becomes one refetch.
		const refresh = () => {
			clearTimeout(queued);
			queued = setTimeout(() => void load(campaignId), 300);
		};
		void load(campaignId);
		const stop = watchParty(campaignId, refresh);
		return () => {
			clearTimeout(queued);
			stop();
		};
	});

	const pct = (member: PartyMember) => (member.maxHp ? Math.round((member.hp / member.maxHp) * 100) : 0);
</script>

<svelte:head><title>PARTY DASHBOARD // CYBRDEK</title></svelte:head>

<h1>PARTY</h1>
<p class="dim">{campaign.name} · <a href="/campaigns">CAMPAIGNS</a></p>

{#if !gm.ready}
	<Panel><p class="dim">CHECKING…</p></Panel>
{:else if !gm.isGm}
	<Panel><p class="dim">Only this campaign's GM can see the party dashboard.</p></Panel>
{:else}
	<div class="layout">
		<section class="party" aria-label="Characters">
			<p class="status dim" role="status">
				{#if error}<span class="error">{error}</span>
				{:else if !loaded}LOADING…
				{:else}LIVE · {party.length} character{party.length === 1 ? '' : 's'}{#if updatedAt} · updated {updatedAt.toLocaleTimeString()}{/if}{/if}
			</p>
			{#if loaded && party.length === 0 && !error}
				<Panel><p class="dim">No characters yet. They appear here once players join and pick one.</p></Panel>
			{/if}
			{#each party as member (member.key)}
				<article class="card" class:hurt={member.wound !== 'unhurt'} class:critical={member.wound === 'seriously' || member.wound === 'mortally'}>
					<button
						type="button"
						class="head"
						aria-expanded={open === member.key}
						onclick={() => (open = open === member.key ? null : member.key)}
					>
						<span class="name">{member.name}</span>
						<span class="dim">{member.role} {member.rank}</span>
					</button>
					<div class="hp" title="{member.hp} of {member.maxHp} HP">
						<div class="bar" style:width="{pct(member)}%"></div>
					</div>
					<p class="line">
						<span><strong>HP {member.hp}/{member.maxHp}</strong></span>
						<span class="wound">{member.woundLabel}</span>
					</p>
					<p class="line dim">
						<span>SP head {member.sp.head} · body {member.sp.body}</span>
						<span>HUM {member.humanity}/{member.maxHumanity}</span>
					</p>
					<p class="line stats">
						{#each KEY_STATS as stat (stat)}<span>{stat} <strong>{member.stats[stat] ?? 0}</strong></span>{/each}
					</p>
					{#if member.injuries.length}
						<p class="injuries">⚠ {member.injuries.join(', ')}</p>
					{/if}
					{#if open === member.key}<PartyCharacter {member} />{/if}
				</article>
			{/each}
		</section>
		<aside class="rolls" aria-label="Campaign rolls">
			<RollLog />
		</aside>
	</div>
{/if}

<style>
	.layout {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
			align-items: start;
		}
	}

	.party {
		display: grid;
		gap: 0.75rem;
	}

	.status {
		margin: 0;
	}

	.card {
		border: 1px solid var(--frame-dim);
		padding: 0.75rem;
		min-width: 0;
	}

	.card.hurt {
		border-color: var(--value);
	}

	.card.critical {
		border-color: var(--red-soft);
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		min-height: 44px;
		padding: 0;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.name {
		font-size: 1.15rem;
		color: var(--mint);
	}

	.hp {
		height: 6px;
		background: var(--frame-dim);
		margin: 0.25rem 0 0.4rem;
	}

	.bar {
		height: 100%;
		background: var(--mint);
	}

	.hurt .bar {
		background: var(--value);
	}

	.critical .bar,
	.critical .wound,
	.injuries,
	.error {
		color: var(--red-soft);
	}

	.critical .bar {
		background: var(--red-soft);
	}

	.line {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.25rem 0.75rem;
		margin: 0.2rem 0;
	}

	.stats {
		justify-content: flex-start;
	}

	.injuries {
		margin: 0.35rem 0 0;
	}

	.dim {
		color: var(--muted);
	}
</style>
