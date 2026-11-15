<script lang="ts">
	// A sheet section you open when you need it (#101): a row showing its title
	// and a one-line summary. Each device remembers which folds were left open.
	// A Panel inside drops its own heading (the row already names it).
	import { setContext, type Snippet } from 'svelte';

	let {
		id,
		title,
		summary = '',
		alert = false,
		forceOpen = false,
		children
	}: {
		id: string; // stable name, for remembering it open
		title: string;
		summary?: string;
		alert?: boolean; // summary shown in red (e.g. an active injury)
		forceOpen?: boolean; // open it now (e.g. a critical injury was just offered)
		children: Snippet;
	} = $props();

	setContext('cybrdek:in-fold', true);

	const key = () => `cybrdek:fold:${id}`;
	function remembered(): boolean {
		try {
			return localStorage.getItem(key()) === '1';
		} catch {
			return false;
		}
	}

	let open = $state(remembered());
	$effect(() => {
		if (forceOpen) open = true;
	});

	function toggled(event: Event) {
		open = (event.currentTarget as HTMLDetailsElement).open;
		try {
			localStorage.setItem(key(), open ? '1' : '0');
		} catch {
			// storage blocked: it just won't be remembered
		}
	}
</script>

<details class="fold" {open} ontoggle={toggled}>
	<summary>
		<span class="arrow" aria-hidden="true"></span>
		<span class="title">{title}</span>
		{#if summary}<span class="summary" class:alert>{summary}</span>{/if}
	</summary>
	<div class="body">
		{@render children()}
	</div>
</details>

<style>
	.fold {
		border-bottom: 1px solid var(--frame-dim);
	}

	summary {
		min-height: 52px;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		cursor: pointer;
		list-style: none;
		font-size: 0.85rem;
		letter-spacing: 0.1em;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:focus-visible {
		outline: 1px solid var(--red);
		outline-offset: 2px;
	}

	.arrow::before {
		content: '▸';
		color: var(--red);
	}

	.fold[open] .arrow::before {
		content: '▾';
	}

	.title {
		flex: 1;
		color: var(--value);
	}

	.summary {
		color: var(--muted);
		font-size: 0.8rem;
		letter-spacing: 0;
		text-align: right;
		overflow-wrap: anywhere;
	}

	.summary.alert {
		color: var(--red-soft);
	}

	.body {
		padding: 0.25rem 0 0.5rem;
	}
</style>
