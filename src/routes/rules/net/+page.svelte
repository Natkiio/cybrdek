<script lang="ts">
	// NET rules quick reference (#100): short summaries in our own words, each
	// with the Core Rulebook pages to check. Works offline (plain data).
	import { NET_RULES } from '#lib/rulesets/red/net-rules.ts';
</script>

<svelte:head><title>NET RULES // CYBRDEK</title></svelte:head>

<h1>NET RULES</h1>
<p class="dim">Quick reminders in our own words. Page numbers are the Cyberpunk RED Core Rulebook. <a href="/rules">Your rulebook →</a></p>

<nav aria-label="NET rules sections">
	{#each NET_RULES as s (s.id)}<a href="#{s.id}">{s.title}</a>{/each}
</nav>

{#each NET_RULES as s (s.id)}
	<section id={s.id} aria-labelledby="{s.id}-title">
		<h2 id="{s.id}-title">{s.title} <span class="dim small">Core p. {s.pages}</span></h2>
		<ul>
			{#each s.points as point (point)}<li>{point}</li>{/each}
		</ul>
	</section>
{/each}

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0.75rem 0;
	}

	nav a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	section {
		border-top: 1px solid var(--frame-dim);
		padding-top: 0.5rem;
		margin-top: 0.75rem;
		scroll-margin-top: 1rem;
	}

	h2 {
		font-size: 1rem;
		color: var(--bright);
		margin: 0 0 0.4rem;
	}

	ul {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.35rem;
		overflow-wrap: anywhere;
	}

	.dim {
		color: var(--muted);
	}

	.small {
		font-size: 0.8rem;
		font-weight: normal;
	}
</style>
