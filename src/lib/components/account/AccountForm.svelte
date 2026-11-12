<script lang="ts">
	import { sendMagicLink, signIn, signUp } from '#lib/supabase/gm.svelte.ts';
	import { resetPassword } from '#lib/supabase/reset.ts';

	// emailLink: the GM-only fallback. Supabase's built-in email can only reach
	// the project's team, so players never see this option (#65).
	let { emailLink = false }: { emailLink?: boolean } = $props();

	let mode = $state<'sign-in' | 'create' | 'reset'>('sign-in');
	const creating = $derived(mode === 'create');
	let email = $state('');
	let password = $state('');
	let code = $state('');
	let busy = $state(false);
	let error = $state('');
	let sent = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		if (mode === 'reset') error = (await resetPassword(email, code, password)) ?? '';
		else error = (await (creating ? signUp : signIn)(email, password)) ?? '';
		busy = false;
	}

	function switchTo(next: typeof mode) {
		mode = next;
		error = '';
		password = '';
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
	{#if mode === 'reset'}
		<input
			autocomplete="one-time-code"
			autocapitalize="characters"
			spellcheck="false"
			required
			placeholder="Reset code, e.g. 3F9A-0C21-B7E4"
			aria-label="Reset code"
			bind:value={code}
		/>
	{/if}
	<input
		type="password"
		autocomplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
		required
		minlength={mode === 'sign-in' ? undefined : 8}
		placeholder={mode === 'sign-in' ? 'Password' : mode === 'reset' ? 'New password (8+ characters)' : 'Choose a password (8+ characters)'}
		aria-label={mode === 'reset' ? 'New password' : 'Password'}
		bind:value={password}
	/>
	<button type="submit" disabled={busy}>
		{mode === 'create' ? 'CREATE ACCOUNT' : mode === 'reset' ? 'SET NEW PASSWORD' : 'SIGN IN'}
	</button>
</form>

{#if creating}<p class="dim">Keep this password safe. If you forget it, your GM can give you a reset code.</p>{/if}
{#if mode === 'reset'}<p class="dim">Ask your GM for a reset code. It works once, for 30 minutes.</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if sent}<p class="ok" aria-live="polite">Link sent. Open the email on this device to sign in.</p>{/if}

<p class="links">
	{#if mode === 'sign-in'}
		<button type="button" class="link" onclick={() => switchTo('create')}>Create an account</button>
		<button type="button" class="link" onclick={() => switchTo('reset')}>Forgot password?</button>
	{:else}
		<button type="button" class="link" onclick={() => switchTo('sign-in')}>Back to sign in</button>
	{/if}
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
