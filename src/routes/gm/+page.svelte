<script lang="ts">
	// The account page used to live here as "GM ACCESS" (#109). Old links and
	// email sign-in links still arrive here, so pass them on, query and #tokens included.
	import { onMount } from 'svelte';

	onMount(() => location.replace(`/account${location.search}${location.hash}`));
</script>

<svelte:head><title>ACCOUNT // CYBRDEK</title></svelte:head>

<p class="dim">Moved to <a href="/account">ACCOUNT</a>…</p>

<style>
	.dim {
		color: var(--muted);
	}
</style>
