<script lang="ts">
	import { page } from '$app/state';
	import Panel from '#lib/components/Panel.svelte';
	import { joinCampaign } from '#lib/campaigns/api.ts';
	import { switchCampaign } from '#lib/campaigns/current.svelte.ts';
	import { gm, sendMagicLink } from '#lib/supabase/gm.svelte.ts';

	let email = $state('');
	let status = $state<'idle' | 'sending' | 'sent'>('idle');
	let error = $state('');
	let joining = false;

	// Once signed in (including when the emailed link brings you back), join.
	$effect(() => {
		if (!gm.ready || !gm.email || joining) return;
		joining = true;
		void joinCampaign(page.params.code ?? '').then((result) => {
			if ('error' in result) error = result.error;
			else switchCampaign(result, '/lore');
		});
	});

	async function send(event: SubmitEvent) {
		event.preventDefault();
		status = 'sending';
		error = (await sendMagicLink(email, page.url.pathname)) ?? '';
		status = error ? 'idle' : 'sent';
	}
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
		<p class="dim">You've been invited to a campaign. Sign in with a one-time link sent by email.</p>
		<form onsubmit={send}>
			<input type="email" autocomplete="email" required placeholder="you@example.com" aria-label="Email" bind:value={email} />
			<button type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'SENDING…' : 'SEND LINK'}</button>
		</form>
		{#if status === 'sent'}<p class="ok" aria-live="polite">Link sent. Open the email on this device to join.</p>{/if}
	</Panel>
{/if}

<style>
	form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
	}

	input {
		width: 100%;
		min-width: 0;
	}

	input,
	button {
		min-height: 44px;
	}

	.dim {
		color: var(--muted);
	}

	.ok {
		color: var(--mint);
	}

	.error {
		color: var(--red-soft);
	}
</style>
