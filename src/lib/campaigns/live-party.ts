// Keeps the GM dashboard (#53) current. Realtime says "a character in this
// campaign changed" and the page refetches, so row-level security still decides
// what arrives. A slow poll and a refetch on returning to the tab catch what a
// campaign-filtered subscription can't see, such as a character leaving.
import { supabase } from '#lib/supabase/client.ts';

export const POLL_MS = 30000;

/** Call `refresh` whenever the party may have changed. Returns a stop function. */
export function watchParty(campaignId: string, refresh: () => void): () => void {
	const client = supabase();
	const channel = client
		.channel(`party:${campaignId}`)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `campaign_id=eq.${campaignId}` }, () =>
			refresh()
		)
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') refresh(); // anything missed while connecting
		});
	const poll = setInterval(() => {
		if (document.visibilityState === 'visible') refresh();
	}, POLL_MS);
	const onVisible = () => {
		if (document.visibilityState === 'visible') refresh();
	};
	document.addEventListener('visibilitychange', onVisible);
	return () => {
		clearInterval(poll);
		document.removeEventListener('visibilitychange', onVisible);
		void client.removeChannel(channel);
	};
}
