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
	.panel {
		border: 1px solid var(--frame-dim);
		border-left: 2px solid var(--frame);
		background: var(--bg-1);
		padding: 1rem;
		margin-bottom: 1rem;
	}

	/* Michroma label with the HUD's segmented mint bar underneath */
	header {
		position: relative;
		font-family: var(--f-label);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--label);
		padding-bottom: 0.6rem;
		margin-bottom: 0.75rem;
	}

	header::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		opacity: 0.85;
		background:
			linear-gradient(
					90deg,
					var(--mint) 0 9%,
					transparent 9% 10.5%,
					var(--mint) 10.5% 24%,
					transparent 24% 24.6%,
					var(--mint) 24.6% 25.4%,
					transparent 25.4% 26%,
					var(--mint) 26% 38%,
					transparent 38% 38.8%,
					var(--mint) 38.8% 82%,
					transparent 82%
				)
				left / 100% 100% no-repeat,
			repeating-linear-gradient(
					90deg,
					var(--mint) 0 2px,
					transparent 2px 3px,
					var(--mint) 3px 6px,
					transparent 6px 8px
				)
				right / 15% 100% no-repeat;
	}
</style>
