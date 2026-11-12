<script lang="ts">
	import { page } from '$app/state';
	import AccountForm from '#lib/components/account/AccountForm.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { joinCampaign } from '#lib/campaigns/api.ts';
	import { switchCampaign } from '#lib/campaigns/current.svelte.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let error = $state('');
	let joining = false;

	// Once signed in, join.
	$effect(() => {
		if (!gm.ready || !gm.email || joining) return;
		joining = true;
		void joinCampaign(page.params.code ?? '').then((result) => {
			if ('error' in result) error = result.error;
			else switchCampaign(result); // to /campaigns, to pick a character
		});
	});
</script>

<svelte:head><title>JOIN A CAMPAIGN // CYBRDEK</title></svelte:head>

<h1>JOIN A CAMPAIGN</h1>

{#if error}
	<Panel><p class="error" role="alert">{error}</p></Panel>
{:else if !gm.ready}
	<Panel><p class="dim">CHECKING…</p></Panel>
{:else if gm.email}
	<Panel><p class="dim">JOINING…</p></Panel>
{:else}
	<Panel title="SIGN IN TO JOIN">
		<p class="dim">You've been invited to a campaign. Sign in or create an account to join.</p>
		<AccountForm />
	</Panel>
{/if}

<style>
	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red-soft);
	}
</style>
