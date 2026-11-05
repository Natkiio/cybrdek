<script lang="ts">
	import Panel from '#lib/components/Panel.svelte';
	import { gm, sendMagicLink, signOut } from '#lib/supabase/gm.svelte.ts';

	let email = $state('');
	let status = $state<'idle' | 'sending' | 'sent'>('idle');
	let error = $state('');

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (!email.trim()) return;
		status = 'sending';
		error = (await sendMagicLink(email)) ?? '';
		status = error ? 'idle' : 'sent';
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
		<button type="button" onclick={signOut}>SIGN OUT</button>
	</Panel>
{:else}
	<Panel title="SIGN IN">
		<p class="dim">
			You can read public campaigns without an account. To run your own campaign, or join one,
			sign in with a one-time link sent by email.
		</p>
		<form onsubmit={send}>
			<input
				type="email"
				autocomplete="email"
				required
				placeholder="you@example.com"
				aria-label="Email"
				bind:value={email}
			/>
			<button type="submit" disabled={status === 'sending'}>
				{status === 'sending' ? 'SENDING…' : 'SEND LINK'}
			</button>
		</form>
		{#if status === 'sent'}
			<p class="ok" aria-live="polite">Link sent. Open the email on this device to sign in.</p>
		{/if}
		{#if error}<p class="error" aria-live="polite">{error}</p>{/if}
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
