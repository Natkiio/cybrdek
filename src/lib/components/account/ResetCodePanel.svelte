<script lang="ts">
	// For the app's admin only: make a one-time code for a player who forgot
	// their password. Shows nothing for anyone else (the database refuses them too).
	import Panel from '#lib/components/Panel.svelte';
	import { isAppAdmin, issueResetCode } from '#lib/supabase/reset.ts';

	let { userId }: { userId: string } = $props();

	let admin = $state(false);
	let email = $state('');
	let issued = $state<{ email: string; code: string } | null>(null);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		void userId;
		admin = false;
		issued = null;
		let stale = false;
		void isAppAdmin().then((yes) => {
			if (!stale) admin = yes;
		});
		return () => (stale = true);
	});

	async function issue(event: SubmitEvent) {
		event.preventDefault();
		// The code belongs to the email it was made for. Keep that, not whatever
		// is in the box when the reply arrives, so it's never shown beside someone else.
		const requested = email.trim();
		busy = true;
		issued = null;
		const result = await issueResetCode(requested);
		busy = false;
		if ('error' in result) error = result.error;
		else {
			error = '';
			issued = { email: requested, code: result.code };
			email = '';
		}
	}
</script>

{#if admin}
	<Panel title="PASSWORD RESET CODES">
		<p class="dim">
			A player forgot their password? Make them a code and pass it on yourself (message, or at the table). It works
			once, for 30 minutes, and a new one replaces it.
		</p>
		<form onsubmit={issue}>
			<input type="email" required placeholder="player@example.com" aria-label="Player's email" disabled={busy} bind:value={email} />
			<button type="submit" disabled={busy}>MAKE CODE</button>
		</form>
		{#if issued}
			<p class="ok" aria-live="polite">
				Code for {issued.email}: <strong class="code">{issued.code}</strong>
			</p>
			<p class="dim">They choose FORGOT PASSWORD? when signing in and enter it there.</p>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</Panel>
{/if}

<style>
	form {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.4rem;
	}

	input {
		min-width: 0;
	}

	input,
	button {
		min-height: 44px;
	}

	.code {
		font-size: 1.2rem;
		letter-spacing: 0.1em;
		user-select: all;
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
