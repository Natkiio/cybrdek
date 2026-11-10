// Who is signed in, and are they the GM? (GM-1, #37)
//
// A `.svelte.ts` module can hold runes, so `gm` is one shared reactive object:
// any component that reads gm.isGm re-renders when it changes.
//
// isGm comes from the database function public.is_campaign_gm(), for the
// current campaign. It only decides what the UI shows; the real protection is
// row-level security on every table.

import { campaign, VOYAGE_CITY_ID } from '#lib/campaigns/current.svelte.ts';
import { clearPrivateCaches } from '#lib/lore/api.ts';
import { setSyncUser, syncCharacters } from '#lib/sync/characters.svelte.ts';
import { supabase } from './client.ts';

export const gm = $state({
	ready: false, // false until the first session check finishes
	email: null as string | null,
	userId: null as string | null,
	isGm: false
});

let started = false;
// Bumped on every session change. A GM lookup that finishes after a newer
// change (sign-out, another account) is stale and gets ignored.
let generation = 0;
// The account this page loaded for: undefined until the first session event.
let pageUser: string | null | undefined;

/** Start tracking the session. Safe to call more than once. */
export function startGmSession() {
	if (started) return;
	started = true;
	supabase().auth.onAuthStateChange((_event, session) => {
		const userId = session?.user.id ?? null;
		// A private campaign's pages hold what this account was allowed to see,
		// and gm.isGm can stay false from one player to the next. So when the
		// account changes, here or in another tab, start every page clean.
		if (pageUser !== undefined && userId !== pageUser && campaign.id !== VOYAGE_CITY_ID) {
			location.reload();
			return;
		}
		pageUser = userId;
		setSyncUser(userId ?? undefined);
		const email = session?.user.email ?? null;
		const sameUser = email === gm.email && gm.ready;
		gm.email = email;
		gm.userId = userId;
		// A different person (or nobody) is never the GM until checked again.
		if (!sameUser) gm.isGm = false;
		// Don't await inside the callback: supabase-js warns that it can deadlock.
		void refreshGm(++generation);
	});
}

async function refreshGm(mine: number) {
	if (!gm.email) {
		gm.isGm = false;
		gm.ready = true;
		return;
	}
	const { data, error } = await supabase().rpc('is_campaign_gm', { campaign: campaign.id });
	if (mine !== generation) return; // the session changed while we waited
	gm.isGm = !error && data === true;
	gm.ready = true;
}

/** Email a magic sign-in link that comes back to `path` (default /gm). */
export async function sendMagicLink(email: string, path = '/gm'): Promise<string | null> {
	const { error } = await supabase().auth.signInWithOtp({
		email: email.trim(),
		options: { emailRedirectTo: `${location.origin}${path}` }
	});
	return error ? error.message : null;
}

function friendly(error: { code?: string; message: string } | null): string | null {
	if (!error) return null;
	if (error.code === 'invalid_credentials') return 'Wrong email or password.';
	if (error.code === 'user_already_exists') return 'That email already has an account. Sign in instead.';
	return error.message;
}

/** Sign in with a password. Returns a readable error, or null. */
export async function signIn(email: string, password: string): Promise<string | null> {
	const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
	return friendly(error);
}

/** Create an account. Email confirmation is off, so this signs in straight away. */
export async function signUp(email: string, password: string): Promise<string | null> {
	const { error } = await supabase().auth.signUp({ email: email.trim(), password });
	return friendly(error);
}

/** Set or change the signed-in account's password. */
export async function changePassword(password: string): Promise<string | null> {
	const { error } = await supabase().auth.updateUser({ password });
	return friendly(error);
}

export async function signOut() {
	await syncCharacters(); // last chance to save edits to the cloud
	clearPrivateCaches(); // first: signing out reloads private campaign pages
	await supabase().auth.signOut();
}
