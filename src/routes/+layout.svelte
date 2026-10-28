<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'HOME' },
		{ href: '/characters', label: 'CHARS' },
		{ href: '/rules', label: 'RULES' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>CYBRDEK</title>
</svelte:head>

<div class="shell">
	<nav>
		<span class="brand">CYBRDEK://</span>
		{#each nav as item (item.href)}
			<a href={item.href} class:active={page.url.pathname === item.href}>{item.label}</a>
		{/each}
	</nav>

	<main>
		{@render children()}
	</main>
</div>

<style>
	.shell {
		max-width: 960px;
		margin: 0 auto;
		padding: 1rem;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		border-bottom: 1px solid var(--frame-dim);
		padding-bottom: 0.75rem;
		margin-bottom: 1.25rem;
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.brand {
		color: var(--red);
		text-shadow: 0 0 12px var(--red-glow);
		font-size: 0.8rem;
		margin-right: auto;
	}

	/* Nav items are bordered boxes, like the HUD's editor tabs */
	nav a {
		color: var(--label);
		border: 1px solid var(--frame-dim);
		padding: 0.45rem 0.75rem;
	}

	nav a:hover,
	nav a:focus-visible {
		color: var(--value);
		border-color: var(--frame);
	}

	/* The active page goes red, with a glow */
	nav a.active {
		color: var(--red);
		border-color: var(--red);
		box-shadow: 0 0 10px var(--red-glow);
		text-shadow: 0 0 8px var(--red-glow);
	}
</style>
