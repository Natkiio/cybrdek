// Who is signed in, and are they the GM? (GM-1, #37)
//
// A `.svelte.ts` module can hold runes, so `gm` is one shared reactive object:
// any component that reads gm.isGm re-renders when it changes.
//
// isGm comes from the database function public.is_campaign_gm(), for the
// current campaign. It only decides what the UI shows; the real protection is
// row-level security on every table.

import { campaign } from '#lib/campaigns/current.svelte.ts';
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

/** Start tracking the session. Safe to call more than once. */
export function startGmSession() {
	if (started) return;
	started = true;
	supabase().auth.onAuthStateChange((_event, session) => {
		const email = session?.user.email ?? null;
		const sameUser = email === gm.email && gm.ready;
		gm.email = email;
		gm.userId = session?.user.id ?? null;
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

export async function signOut() {
	await supabase().auth.signOut();
}
