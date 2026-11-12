<script lang="ts">
	import AccountForm from '#lib/components/account/AccountForm.svelte';
	import ResetCodePanel from '#lib/components/account/ResetCodePanel.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import { changePassword, gm, signOut } from '#lib/supabase/gm.svelte.ts';

	let password = $state('');
	let saved = $state(false);
	let error = $state('');

	async function save(event: SubmitEvent) {
		event.preventDefault();
		error = (await changePassword(password)) ?? '';
		saved = !error;
		if (saved) password = '';
	}
</script>

<svelte:head>
	<title>GM ACCESS // CYBRDEK</title>
</svelte:head>

<h1>GM ACCESS</h1>

{#if !gm.ready}
	<Panel title="SESSION"><p class="dim">CHECKING…</p></Panel>
{:else if gm.email}
	<Panel title="SESSION">
		<p>Signed in as <strong>{gm.email}</strong></p>
		{#if gm.isGm}
			<p class="ok">GM MODE ACTIVE. You can edit campaign content.</p>
		{:else}
			<p class="dim">You're not a GM of this campaign, so you see what its players see.</p>
		{/if}
		<p><a href="/campaigns">YOUR CAMPAIGNS →</a></p>
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
		<p><button type="button" onclick={signOut}>SIGN OUT</button></p>
	</Panel>
	{#if gm.userId}<ResetCodePanel userId={gm.userId} />{/if}
{:else}
	<Panel title="SIGN IN">
		<p class="dim">
			You can read public campaigns without an account. To run your own campaign, or join one,
			sign in or create an account.
		</p>
		<AccountForm emailLink />
	</Panel>
{/if}

<style>
	form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
		margin-top: 0.75rem;
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
		color: var(--mint);
	}

	.dim {
		color: var(--muted);
	}

	.error {
		color: var(--red);
	}
</style>
