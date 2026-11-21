<script lang="ts">
	// Home: the dashboard the boot sequence lands on (#101). Your character at a
	// glance, the latest rolls, and where to go next.
	import { onMount } from 'svelte';
	import RollLog from '#lib/components/RollLog.svelte';
	import { campaign } from '#lib/campaigns/current.svelte.ts';
	import { summarise, type PartyMember } from '#lib/campaigns/party.ts';
	import { listCharacters } from '#lib/storage/characters.ts';
	import { characterSync } from '#lib/sync/characters.svelte.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let me = $state<{ id: string; summary: PartyMember } | null>(null);
	let loaded = $state(false);

	async function load() {
		const latest = (await listCharacters())[0];
		const summary = latest ? summarise(latest.id, latest) : undefined;
		me = latest && summary ? { id: latest.id, summary } : null;
		loaded = true;
	}

	onMount(() => void load());
	// A change from another device shows here too.
	let seenRevision = characterSync.revision;
	$effect(() => {
		if (characterSync.revision !== seenRevision) {
			seenRevision = characterSync.revision;
			void load();
		}
	});

	// Two letters for the avatar until portraits arrive (#87): "Vex" → VE, "Johnny Silverhand" → JS.
	const initials = (name: string) => {
		const words = name.trim().split(/\s+/).filter(Boolean);
		const letters = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '');
		return letters.slice(0, 2).toUpperCase() || '??';
	};
	const pct = (m: PartyMember) => (m.maxHp ? Math.round((m.hp / m.maxHp) * 100) : 0);
</script>

<svelte:head><title>CYBRDEK</title></svelte:head>

<h1 class="sr-only">Home</h1>

{#if gm.ready && !gm.email}
	<!-- Signed out (#109): one account for everything, or carry on without one. -->
	<section class="welcome" aria-labelledby="welcome-title">
		<h2 id="welcome-title" class="section-title">NEW HERE?</h2>
		<p class="dim">One account keeps your characters safe and lets you join a campaign or run your own as its GM.</p>
		<div class="choices">
			<a href="/account">LOG IN</a>
			<a href="/account?new" class="primary">CREATE ACCOUNT</a>
		</div>
	</section>
{/if}

{#if !loaded}
	<p class="dim">LOADING…</p>
{:else if me}
	{@const m = me.summary}
	<section class="me" class:hurt={m.wound !== 'unhurt'} class:critical={m.wound === 'mortally'} aria-label="Your character">
		<div class="who">
			<div class="avatar" aria-hidden="true">{initials(m.name)}</div>
			<div class="name">
				<span class="handle">{m.name}</span>
				<span class="dim">{m.role} {m.rank}</span>
			</div>
			<a class="open" href="/characters/{encodeURIComponent(me.id)}">SHEET →</a>
		</div>
		<div class="hp-line">
			<span class="hp">{m.hp}<span class="dim">{' '}/ {m.maxHp} HP</span></span>
			<span class="wound">{m.woundLabel}</span>
		</div>
		<div class="track" aria-hidden="true"><div class="bar" style:width="{pct(m)}%"></div></div>
		<p class="dim small">
			SP head {m.sp.head} · body {m.sp.body}{#if m.injuries.length}{' '}· {m.injuries.length} injur{m.injuries.length === 1 ? 'y' : 'ies'}: {m.injuries.join(', ')}{/if}
		</p>
	</section>
{:else}
	<section class="me empty" aria-label="Your character">
		<p>No character on this device yet.</p>
		<a class="open" href="/characters/new">+ MAKE A CHARACTER</a>
	</section>
{/if}

<RollLog />

<section class="next" aria-labelledby="next-title">
	<h2 id="next-title" class="section-title">NEXT UP</h2>
	<div class="grid">
		<a href="/combat"><span class="kicker">COMBAT</span><span>The fight tracker</span></a>
		<a href="/map"><span class="kicker">MAP</span><span>{campaign.name}</span></a>
		<a href="/dice"><span class="kicker">DICE</span><span>Free roller</span></a>
		<a href="/lore"><span class="kicker">LORE</span><span>People, places, factions</span></a>
	</div>
</section>

<style>
	.welcome {
		border: 1px solid var(--frame-dim);
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.welcome p {
		margin: 0.25rem 0 0.75rem;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.choices a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 1rem;
		border: 1px solid var(--frame-dim);
		color: var(--value);
		flex: 1 1 10rem;
		text-decoration: none;
	}

	.choices .primary {
		color: var(--bright);
		border-color: var(--bright);
	}

	.me {
		border: 1px solid var(--red);
		background: var(--bg-1);
		box-shadow: 0 0 18px rgba(255, 31, 75, 0.18);
		padding: 0.9rem;
		margin-bottom: 1.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.me.empty {
		align-items: flex-start;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.avatar {
		width: 3.5rem;
		height: 3.5rem;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--red);
		background: #140508;
		color: var(--red);
		font-family: var(--f-label);
		font-size: 1.1rem;
	}

	.name {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.handle {
		font-family: var(--f-label);
		font-size: 1.1rem;
		letter-spacing: 0.05em;
		color: var(--bright);
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}

	.open {
		margin-left: auto;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.8rem;
		border: 1px solid var(--red);
		color: var(--red);
		letter-spacing: 0.1em;
		font-size: 0.8rem;
		white-space: nowrap;
	}

	.me.empty .open {
		margin-left: 0;
	}

	.hp-line {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.hp {
		font-family: var(--f-text);
		font-weight: 700;
		font-size: 1.9rem;
		color: var(--bright);
		font-variant-numeric: tabular-nums;
	}

	.hp .dim {
		font-size: 1rem;
	}

	.wound {
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--label);
	}

	.hurt .wound {
		color: var(--red-soft);
	}

	.critical .wound {
		color: var(--red);
	}

	.track {
		height: 6px;
		background: var(--bg-3);
	}

	.bar {
		height: 100%;
		background: var(--bright);
	}

	.hurt .bar {
		background: var(--red-soft);
	}

	.critical .bar {
		background: var(--red);
	}

	.small {
		margin: 0;
		font-size: 0.8rem;
	}

	.section-title {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: 0.7rem;
		color: var(--label);
		text-shadow: none;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--frame-dim);
		margin-bottom: 0.85rem;
	}

	.section-title::before {
		content: '//';
		color: var(--red);
		font-family: var(--f-mono);
		letter-spacing: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.grid a {
		min-height: 4rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--frame-dim);
		color: var(--value);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		overflow-wrap: anywhere;
	}

	.grid a:hover,
	.grid a:focus-visible {
		border-color: var(--red);
	}

	.kicker {
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		color: var(--red);
	}

	@media (min-width: 700px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
