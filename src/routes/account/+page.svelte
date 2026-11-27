<script lang="ts">
	// Your account (#109). Signed out: the welcome page, to log in or make an
	// account. There's one kind of account: you're the GM of the campaigns you
	// create and a player in the ones you join. Signed in: settings and sign-out.
	import { page } from '$app/state';
	import AccountForm from '#lib/components/account/AccountForm.svelte';
	import ResetCodePanel from '#lib/components/account/ResetCodePanel.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { myRole, type CampaignRole } from '#lib/campaigns/api.ts';
	import { campaign, VOYAGE_CITY_ID } from '#lib/campaigns/current.svelte.ts';
	import { changePassword, gm, signOut } from '#lib/supabase/gm.svelte.ts';

	const start = $derived(page.url.searchParams.has('new') ? 'create' : 'sign-in');

	let password = $state('');
	let saved = $state(false);
	let error = $state('');
	let role = $state<CampaignRole | null | 'unknown' | undefined>(undefined); // undefined: still checking

	$effect(() => {
		const userId = gm.userId;
		const id = campaign.id;
		void gm.isGm; // re-check when GM mode changes
		role = undefined;
		if (!userId) return;
		let stale = false;
		void myRole(id, userId).then((found) => {
			if (!stale) role = found;
		});
		return () => (stale = true);
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		error = (await changePassword(password)) ?? '';
		saved = !error;
		if (saved) password = '';
	}
</script>

<svelte:head>
	<title>{gm.email ? 'ACCOUNT' : 'WELCOME'} // CYBRDEK</title>
</svelte:head>

{#if !gm.ready}
	<h1>ACCOUNT</h1>
	<Panel title="SESSION"><p class="dim">CHECKING…</p></Panel>
{:else if gm.email}
	<h1>ACCOUNT</h1>
	<Panel title="SIGNED IN">
		<p>Signed in as <strong>{gm.email}</strong></p>
		<p class="role" aria-live="polite">
			{#if gm.isGm || role === 'gm'}
				<span class="ok">You're the GM of {campaign.name}.</span> You can manage it, its players and its content.
			{:else if role === 'player'}
				You play in <strong>{campaign.name}</strong>.
			{:else if role === 'unknown'}
				<span class="dim">Couldn't check your role in {campaign.name}. Check your connection.</span>
			{:else if role === null}
				<span class="dim">
					You're looking at {campaign.name}{campaign.id === VOYAGE_CITY_ID ? ', the public demo campaign' : ''}, but you're not in it.
				</span>
			{:else}
				<span class="dim">Checking your role in {campaign.name}…</span>
			{/if}
		</p>
		<p><a class="action-link" href="/campaigns">YOUR CAMPAIGNS →</a> <span class="dim">Create one to run it as its GM, or join one with an invite link.</span></p>
		<p><button type="button" onclick={signOut}>SIGN OUT</button></p>
	</Panel>

	<Panel title="PASSWORD">
		<form onsubmit={save}>
			<input
				type="password"
				autocomplete="new-password"
				required
				minlength="8"
				placeholder="New password (8+ characters)"
				aria-label="New password"
				bind:value={password}
			/>
			<button type="submit">SET PASSWORD</button>
		</form>
		{#if saved}<p class="ok" aria-live="polite">Password saved.</p>{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</Panel>
	{#if gm.userId}<ResetCodePanel userId={gm.userId} />{/if}
{:else}
	<h1>WELCOME TO CYBRDEK</h1>
	<Panel title="LOG IN OR CREATE AN ACCOUNT">
		<p class="dim">
			One account for everything: keep your characters in the cloud, join your friends' campaigns, or start your own and
			run it as its GM.
		</p>
		{#key start}<AccountForm emailLink {start} />{/key}
	</Panel>
	<p class="dim"><a class="action-link" href="/">KEEP BROWSING WITHOUT AN ACCOUNT →</a> Characters stay on this device, and public campaigns are open to read.</p>
{/if}

<style>
	form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
	}

	input,
	button {
		min-height: 44px;
	}

	input {
		width: 100%;
		min-width: 0;
	}

	strong {
		color: var(--value);
	}

	.ok {
		color: var(--bright);
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red);
	}
</style>
