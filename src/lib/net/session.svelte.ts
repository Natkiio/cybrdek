import { supabase } from '#lib/supabase/client.ts';
import { readArchitectures, saveArchitecture, deleteArchitecture } from './api.ts';
import type { Architecture, ArchitectureView } from './architecture.ts';
/** One mounted account/campaign. No Architecture content is cached on disk. */
export function architectureSession(campaign: string) {
	const state = $state({
		view: null as ArchitectureView | null,
		loading: true,
		busy: false,
		error: ''
	});
	let active = true;
	let version = 0;
	async function refresh(whileSaving = false) {
		if (!active || (state.busy && !whileSaving)) return;
		const mine = ++version;
		try {
			const result = await readArchitectures(campaign);
			if (!active || mine !== version) return;
			if ('error' in result) {
				state.view = null;
				state.error = result.error;
			} else {
				state.view = result;
				state.error = '';
			}
		} catch {
			if (active && mine === version) {
				state.view = null;
				state.error = 'Architectures unavailable. Try refreshing.';
			}
		} finally {
			if (active && mine === version) state.loading = false;
		}
	}
	async function mutate(write: () => ReturnType<typeof saveArchitecture>) {
		if (!active || state.busy || !state.view?.canManage) return false;
		state.busy = true;
		state.error = '';
		const mine = ++version;
		let success = false;
		try {
			const result = await write();
			if (!active || mine !== version) return false;
			++version;
			if ('error' in result) {
				await refresh(true);
				if (active) state.error = result.error;
			} else {
				state.view = result;
				success = true;
			}
		} catch {
			if (active && mine === version) {
				await refresh(true);
				if (active) state.error = 'Save outcome unknown. Refresh and review before trying again.';
			}
		} finally {
			if (active) state.busy = false;
		}
		return active && success;
	}
	function start() {
		const channel = supabase()
			.channel(`net:${campaign}:${crypto.randomUUID()}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'net_architecture_updates',
					filter: `campaign_id=eq.${campaign}`
				},
				() => {
					void refresh();
				}
			)
			.subscribe((status) => {
				if (active && status === 'SUBSCRIBED') void refresh();
			});
		const visible = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		const online = () => {
			void refresh();
		};
		const offline = () => {
			++version;
			state.view = null;
			state.loading = false;
			state.error = 'Go online to view campaign Architectures.';
		};
		window.addEventListener('online', online);
		window.addEventListener('offline', offline);
		document.addEventListener('visibilitychange', visible);
		const timer = window.setInterval(online, 30_000);
		void refresh();
		return () => {
			active = false;
			++version;
			state.view = null;
			window.clearInterval(timer);
			window.removeEventListener('online', online);
			window.removeEventListener('offline', offline);
			document.removeEventListener('visibilitychange', visible);
			void supabase().removeChannel(channel);
		};
	}
	return {
		state,
		refresh: () => refresh(),
		start,
		save: (a: Architecture, id: string | null, revision: number) =>
			mutate(() => saveArchitecture(campaign, id, revision, a)),
		remove: (id: string, revision: number) =>
			mutate(() => deleteArchitecture(campaign, id, revision))
	};
}
