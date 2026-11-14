import { supabase } from '#lib/supabase/client.ts';
import { readEncounter, writeEncounter, readParty, type EncounterView, type PartyCharacter } from './api.ts';
import type { Encounter } from './encounter.ts';

/** A single mounted account/campaign owns this session. Never caches raw fights on disk. */
export function encounterSession(campaign: string, owner: string) {
	const state = $state({ view: null as EncounterView | null, party: [] as PartyCharacter[],
		loading: true, busy: false, error: '' });
	let active = true;
	let request = 0;
	let writeVersion = 0;

	async function refresh() {
		if (!active) return;
		const mine = ++request;
		const version = writeVersion;
		try {
			const result = await readEncounter(campaign, owner);
			if (!active || mine !== request || version !== writeVersion) return;
			if ('error' in result) {
				state.view = null; state.party = []; state.error = result.error;
			} else {
				state.view = result; state.error = '';
				if (!result.canManage) state.party = [];
			}
		} catch {
			if (active && mine === request && version === writeVersion) {
				state.view = null; state.party = []; state.error = 'Campaign fight unavailable. Try refreshing.';
			}
		} finally { if (active && mine === request) state.loading = false; }
	}
	async function party() {
		if (!active || !state.view?.canManage) return;
		const version = writeVersion;
		try {
			const result = await readParty(campaign);
			if (!active || version !== writeVersion || !state.view?.canManage) return;
			if ('error' in result) state.error = result.error;
			else state.party = result;
		} catch { if (active && version === writeVersion) state.error = 'Could not load campaign characters.'; }
	}
	async function save(next: Encounter, finish = false, create = false) {
		const view = state.view;
		if (!active || state.busy || !view?.canManage) return;
		state.busy = true; state.error = '';
		++request; ++writeVersion; // older reads must not undo a successful write
		try {
			const result = await writeEncounter(campaign, owner, create ? { id: null, revision: 0, ended: false } : view, next, finish);
			if (!active) return;
			++request; ++writeVersion;
			if ('error' in result) {
				// Refetch after rejection too: GM rights may have been revoked.
				await refresh();
				if (active) state.error = result.error;
			} else { state.view = result; state.loading = false; }
		} catch {
			if (active) { await refresh(); if (active) state.error = 'Could not save the fight. Refresh before trying again.'; }
		} finally { if (active) state.busy = false; }
	}
	function start() {
		const reload = async () => { await refresh(); if (active) await party(); };
		const channel = supabase().channel(`combat:${campaign}:${owner}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_encounter_updates', filter: `campaign_id=eq.${campaign}` }, () => { void refresh(); })
			.subscribe(status => { if (active && status === 'SUBSCRIBED') void reload(); });
		const visible = () => { if (document.visibilityState === 'visible') void reload(); };
		window.addEventListener('online', reload);
		document.addEventListener('visibilitychange', visible);
		const timer = window.setInterval(reload, 30_000); // revocation and missed-notification fallback
		void reload();
		return () => {
			active = false; ++request; ++writeVersion;
			state.view = null; state.party = [];
			window.removeEventListener('online', reload); document.removeEventListener('visibilitychange', visible);
			window.clearInterval(timer); void supabase().removeChannel(channel);
		};
	}
	return { state, refresh, party, save, start };
}
