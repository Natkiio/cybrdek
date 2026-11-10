// Forgotten passwords with no email (see supabase/migrations/*_password_resets.sql):
// the app's admin issues a one-time code, the player enters it with a new password.
import { signIn } from './gm.svelte.ts';
import { supabase } from './client.ts';

/** True for the app's admin (an email in public.gms), who can issue codes. */
export async function isAppAdmin(): Promise<boolean> {
	const { data, error } = await supabase().rpc('is_gm');
	return !error && data === true;
}

/** A one-time code for the player with this email, valid 30 minutes. */
export async function issueResetCode(email: string): Promise<{ code: string } | { error: string }> {
	const { data, error } = await supabase().rpc('issue_password_reset', { player_email: email.trim() });
	if (error) {
		if (error.code === 'P0002') return { error: 'No account uses that email.' };
		if (error.code === '42501') return { error: 'Only the app admin can make reset codes.' };
		return { error: 'Could not make a code. Check your connection and try again.' };
	}
	return { code: data as string };
}

/** Set a new password with a code, then sign straight in with it. */
export async function resetPassword(email: string, code: string, password: string): Promise<string | null> {
	const { error } = await supabase().functions.invoke('reset-password', {
		body: { email: email.trim(), code, password }
	});
	if (error) {
		// The function explains itself in the reply body; anything else is the network.
		const context = (error as { context?: unknown }).context;
		const body = context instanceof Response ? await context.json().catch(() => null) : null;
		return typeof body?.error === 'string' ? body.error : 'Could not reach Cybrdek. Check your connection and try again.';
	}
	return signIn(email, password);
}
