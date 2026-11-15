<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { startCampaignRolls } from '#lib/rolls/campaign.svelte.ts';
	import { page } from '$app/state';
	import { campaign } from '#lib/campaigns/current.svelte.ts';
	import { gm, startGmSession } from '#lib/supabase/gm.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'HOME' },
		{ href: '/characters', label: 'CHARACTERS' },
		{ href: '/dice', label: 'DICE' },
		{ href: '/combat', label: 'COMBAT' },
		{ href: '/map', label: 'MAP' },
		{ href: '/lore', label: 'LORE' },
		{ href: '/rules', label: 'RULES' },
		{ href: '/campaigns', label: 'CAMPAIGNS' }
	];

	const isHere = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	const here = $derived(nav.find((item) => isHere(item.href))?.label ?? (page.url.pathname === '/gm' ? 'ACCOUNT' : ''));

	// Who's signed in, as the account square shows it (the screen-reader name keeps the old words).
	const accountName = $derived(gm.isGm ? 'GM MODE' : gm.email ? 'SIGNED IN' : 'SIGN IN');
	const initials = $derived((gm.email ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase());

	// Phones: the compact bar's menu. Closes on any navigation and on Escape.
	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement>();
	afterNavigate(() => (menuOpen = false));
	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !menuOpen) return;
		const focusInMenu = document.activeElement?.closest('#site-menu');
		menuOpen = false;
		// Removing the focused link must not leave keyboard users on the body.
		if (focusInMenu) menuButton?.focus();
	}

	onMount(startGmSession);
	$effect(() => {
		const id = campaign.id;
		const userId = gm.userId;
		// Only account/campaign changes restart the session, not its own log updates.
		return untrack(() => startCampaignRolls(id, userId));
	});
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>CYBRDEK</title>
</svelte:head>

<!-- One compact bar on every screen (#101). Laptops show the sections inline;
     phones show where you are and open the full list from the menu button. -->
<header class="bar" class:open={menuOpen}>
	<div class="bar-row">
		<a href="/" class="brand">CYBRDEK://</a>
		<span class="here" aria-hidden="true">{here}</span>
		<nav class="inline" aria-label="Sections">
			{#each nav as item (item.href)}
				<a href={item.href} class:active={isHere(item.href)} aria-current={isHere(item.href) ? 'page' : undefined}>{item.label}</a>
			{/each}
		</nav>
		<a href="/campaigns" class="campaign" aria-label="CAMPAIGN: {campaign.name}">
			<span class="campaign-name">{campaign.name}</span> ▾
		</a>
		<a href="/gm" class="account" class:gm={gm.isGm} class:active={page.url.pathname === '/gm'} aria-label={accountName}>
			{#if gm.email}{initials || 'ME'}{#if gm.isGm}<span class="gm-tag">GM</span>{/if}{:else}SIGN IN{/if}
		</a>
		<button
			type="button"
			class="menu-button"
			bind:this={menuButton}
			aria-label={menuOpen ? 'Close menu' : 'Menu'}
			aria-expanded={menuOpen}
			aria-controls="site-menu"
			onclick={() => (menuOpen = !menuOpen)}
		>
			<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
				{#if menuOpen}<path d="M2 0l14 14M16 0L2 14" />{:else}<path d="M0 1h18M0 7h18M0 13h18" />{/if}
			</svg>
		</button>
	</div>
	{#if menuOpen}
		<nav id="site-menu" class="menu" aria-label="Sections">
			{#each nav as item, i (item.href)}
				<a href={item.href} class:active={isHere(item.href)} aria-current={isHere(item.href) ? 'page' : undefined}>
					<span class="num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{item.label}
					{#if isHere(item.href)}<span class="tag" aria-hidden="true">HERE</span>{/if}
				</a>
			{/each}
			<a href="/gm" class="menu-account">
				<span class="num" aria-hidden="true">··</span>{gm.email ? 'ACCOUNT' : 'SIGN IN'}
				{#if gm.isGm}<span class="tag">GM OF {campaign.name}</span>{/if}
			</a>
		</nav>
	{/if}
</header>

<div class="shell">
	<main>
		{@render children()}
	</main>

	<!-- Wording from R. Talsorian Games' Homebrew Content Policy. Keep it on every page. -->
	<footer>
		Cybrdek is unofficial content provided under the
		<a href="https://rtalsoriangames.com/homebrew-content-policy/" rel="noreferrer">Homebrew Content Policy</a>
		of R. Talsorian Games and is not approved or endorsed by RTG. This content references materials
		that are the property of R. Talsorian Games and its licensees.
	</footer>
</div>

<style>
	.shell {
		max-width: 960px;
		margin: 0 auto;
		padding: 1.25rem 1rem 1rem;
	}

	footer {
		margin-top: 2rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--frame-dim);
		color: var(--muted);
		font-size: 0.75rem;
		line-height: 1.5;
	}

	footer a {
		color: var(--label);
		text-decoration: underline;
	}

	/* ---- the bar */
	.bar {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--bg-1);
		border-bottom: 1px solid var(--frame-dim);
	}

	.bar.open {
		border-bottom-color: var(--red);
	}

	.bar-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 3.5rem;
		padding: 0.35rem 0.75rem 0.35rem 1rem;
		font-family: var(--f-mono);
		letter-spacing: 0.08em;
	}

	.bar a {
		border-bottom: none;
	}

	.brand {
		font-family: var(--f-label);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		color: var(--red);
		text-shadow: 0 0 12px var(--red-glow);
	}

	.here {
		font-size: 0.75rem;
		color: var(--muted);
		letter-spacing: 0.1em;
	}

	.inline {
		display: none;
	}

	.campaign,
	.account {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0 0.6rem;
		border: 1px solid var(--frame-dim);
		color: var(--value);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.campaign {
		margin-left: auto;
		min-width: 0;
		max-width: 11rem;
	}

	.campaign-name {
		overflow: hidden;
		text-overflow: ellipsis;
		text-transform: uppercase;
	}

	.account {
		justify-content: center;
		min-width: 44px;
		color: var(--label);
	}

	.account.gm {
		border-color: var(--bright-dim);
		color: var(--bright);
	}

	.gm-tag {
		font-size: 0.6rem;
		color: var(--red);
	}

	.campaign:hover,
	.campaign:focus-visible,
	.account:hover,
	.account:focus-visible,
	.account.active {
		border-color: var(--red);
		color: var(--red);
	}

	.menu-button {
		width: 44px;
		height: 44px;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
	}

	.menu-button path {
		stroke: var(--value);
		stroke-width: 2;
		fill: none;
	}

	.open .menu-button {
		background: var(--red);
		border-color: var(--red);
	}

	.open .menu-button path {
		stroke: var(--ink-on-red);
	}

	/* ---- the phone menu: drops down under the bar */
	.menu {
		display: flex;
		flex-direction: column;
		padding: 0.25rem 1rem 1rem;
		max-height: calc(100dvh - 3.5rem);
		overflow-y: auto;
	}

	.menu a {
		min-height: 52px;
		display: flex;
		align-items: center;
		gap: 0.9rem;
		border-bottom: 1px solid var(--bg-3);
		color: var(--value);
		font-size: 1rem;
		letter-spacing: 0.06em;
	}

	.menu a.active {
		color: var(--red);
	}

	.num {
		width: 1.4rem;
		color: var(--faint);
		font-size: 0.75rem;
	}

	.menu a.active .num {
		color: var(--red);
	}

	.tag {
		margin-left: auto;
		font-size: 0.7rem;
		color: var(--red);
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.menu-account {
		margin-top: 0.5rem;
		color: var(--label) !important;
	}

	/* ---- laptops: everything on one row, no menu button */
	@media (min-width: 900px) {
		.bar-row {
			gap: 1.4rem;
			padding: 0.35rem clamp(1rem, 3vw, 4.5rem);
		}

		.here,
		.menu-button,
		.menu {
			display: none;
		}

		.inline {
			display: flex;
			flex-wrap: wrap;
			gap: 0.25rem 1.25rem;
			font-size: 0.8rem;
			letter-spacing: 0.1em;
		}

		.inline a {
			color: var(--label);
			padding: 0.4rem 0 0.25rem;
			border-bottom: 2px solid transparent;
		}

		.inline a:hover,
		.inline a:focus-visible {
			color: var(--value);
		}

		.inline a.active {
			color: var(--red);
			border-bottom-color: var(--red);
		}

		.campaign {
			max-width: 16rem;
		}
	}
</style>
