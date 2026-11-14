<script lang="ts">
	import { page } from '$app/state';
	import AccountForm from '#lib/components/account/AccountForm.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { joinCampaign, setCampaignDisplayName, type CampaignRow } from '#lib/campaigns/api.ts';
	import { switchCampaign } from '#lib/campaigns/current.svelte.ts';
	import { gm } from '#lib/supabase/gm.svelte.ts';

	let error = $state('');
	let joined = $state<{ campaign: CampaignRow; userId: string } | null>(null);
	let displayName = $state('');
	let nameError = $state('');
	let saving = $state(false);
	let generation = 0;

	// Membership comes first. A different account or invite starts a fresh prompt,
	// and responses from the previous one cannot update it or navigate away.
	$effect(() => {
		const userId = gm.userId;
		const code = page.params.code ?? '';
		const ready = gm.ready;
		const mine = ++generation;
		joined = null;
		displayName = '';
		error = '';
		nameError = '';
		saving = false;
		if (ready && userId) {
			void joinCampaign(code).then((result) => {
				if (mine !== generation) return;
				if ('error' in result) error = result.error;
				else joined = { campaign: result, userId };
			});
		}
		return () => { generation++; };
	});

	function skip() {
		if (!saving && joined?.userId === gm.userId) switchCampaign(joined.campaign);
	}

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		const destination = joined;
		const name = displayName.trim();
		if (saving || !name || !destination || destination.userId !== gm.userId) return;
		const mine = generation;
		saving = true;
		nameError = '';
		const problem = await setCampaignDisplayName(destination.campaign.id, name);
		if (mine !== generation) return;
		saving = false;
		if (problem) nameError = problem;
		else switchCampaign(destination.campaign);
	}
</script>

<svelte:head><title>JOIN A CAMPAIGN // CYBRDEK</title></svelte:head>

<h1>JOIN A CAMPAIGN</h1>

{#if error}
	<Panel><p class="error" role="alert">{error}</p></Panel>
{:else if !gm.ready}
	<Panel><p class="dim">CHECKING…</p></Panel>
{:else if gm.userId && joined}
	<Panel title="YOUR NAME AT THIS TABLE">
		<p>You joined <strong>{joined.campaign.name}</strong>.</p>
		<p class="dim">Choose the name campaign members see beside your rolls. You can set or change it later in CAMPAIGNS.</p>
		<form onsubmit={saveName}>
			<label for="display-name">Campaign display name</label>
			<input id="display-name" autocomplete="nickname" maxlength="80" placeholder="e.g. Vex" bind:value={displayName} disabled={saving} />
			<div class="actions">
				<button type="submit" disabled={saving || !displayName.trim()}>{saving ? 'SAVING…' : 'SAVE AND CONTINUE'}</button>
				<button type="button" disabled={saving} onclick={skip}>SKIP FOR NOW</button>
			</div>
		</form>
		{#if nameError}<p class="error" role="alert">{nameError}</p>{/if}
	</Panel>
{:else if gm.userId}
	<Panel><p class="dim">JOINING…</p></Panel>
{:else}
	<Panel title="SIGN IN TO JOIN">
		<p class="dim">You've been invited to a campaign. Sign in or create an account to join.</p>
		<AccountForm />
	</Panel>
{/if}

<style>
	form { display: grid; gap: 0.5rem; }
	input { width: 100%; min-width: 0; }
	input, button { min-height: 44px; }
	label, .dim { color: var(--muted); }
	.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	strong { color: var(--value); }
	.error { color: var(--red-soft); }
</style>
