<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<section class="panel">
	{#if title}
		<header>{title}</header>
	{/if}
	{@render children()}
</section>

<style>
	/* Sections read like terminal output: a red // and the title over a thin
	   line, no box. Things you act on (HP, weapons, the current turn) keep a
	   frame of their own (#101). */
	.panel {
		margin-bottom: 1.75rem;
		min-width: 0;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--label);
		padding-bottom: 0.5rem;
		margin-bottom: 0.85rem;
		border-bottom: 1px solid var(--frame-dim);
	}

	header::before {
		content: '//';
		color: var(--red);
		font-family: var(--f-mono);
		letter-spacing: 0;
	}
</style>
