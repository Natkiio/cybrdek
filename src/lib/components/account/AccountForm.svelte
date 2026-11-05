<script lang="ts">
	import { sendMagicLink, signIn, signUp } from '#lib/supabase/gm.svelte.ts';

	// emailLink: the GM-only fallback. Supabase's built-in email can only reach
	// the project's team, so players never see this option (#65).
	let { emailLink = false }: { emailLink?: boolean } = $props();

	let creating = $state(false);
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state('');
	let sent = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = (await (creating ? signUp : signIn)(email, password)) ?? '';
		busy = false;
	}

	async function sendLink() {
		if (!email.trim()) {
			error = 'Enter your email first.';
			return;
		}
		busy = true;
		error = (await sendMagicLink(email)) ?? '';
		sent = !error;
		busy = false;
	}
</script>

<form onsubmit={submit}>
	<input type="email" autocomplete="email" required placeholder="you@example.com" aria-label="Email" bind:value={email} />
	<input
		type="password"
		autocomplete={creating ? 'new-password' : 'current-password'}
		required
		minlength={creating ? 8 : undefined}
		placeholder={creating ? 'Choose a password (8+ characters)' : 'Password'}
		aria-label="Password"
		bind:value={password}
	/>
	<button type="submit" disabled={busy}>{creating ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>
</form>

{#if creating}<p class="dim">Keep this password safe: Cybrdek can't email you a new one yet.</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if sent}<p class="ok" aria-live="polite">Link sent. Open the email on this device to sign in.</p>{/if}

<p class="links">
	<button type="button" class="link" onclick={() => { creating = !creating; error = ''; }}>
		{creating ? 'I already have an account' : 'Create an account'}
	</button>
	{#if emailLink}<button type="button" class="link" disabled={busy} onclick={sendLink}>GM: email me a link</button>{/if}
</p>

<style>
	form {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.75rem;
	}

	input {
		width: 100%;
		min-width: 0;
	}

	input,
	form button {
		min-height: 44px;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0.75rem 0 0;
	}

	.link {
		min-height: 44px;
		padding: 0 0.3rem;
		background: none;
		border: none;
		color: var(--mint);
		text-decoration: underline;
		cursor: pointer;
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
