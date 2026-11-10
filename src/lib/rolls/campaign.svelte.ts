import type { RollEntry } from './log.svelte.ts';
import { supabase } from '#lib/supabase/client.ts';
import { CAMPAIGN_ROLL_LIMIT, GM_HIDDEN_ROLLS } from './settings.ts';

export interface CampaignRoll extends RollEntry {
	userId: string;
	rollerName?: string;
	hidden: boolean;
}
interface PendingRoll extends CampaignRoll { campaignId: string }
// Intentionally retained on sign-out so offline rolls survive until their owner
// returns. Only its original account and campaign can render or send those entries.
// Someone with access to this device can inspect localStorage,
// including hidden-roll labels. Shared remote history is never cached.
const QUEUE_KEY = 'cybrdek:pending-rolls';
export const sharedRolls = $state({
	entries: [] as CampaignRoll[], member: false, hidden: false,
	status: '', rejected: 0, pending: 0, pendingEntries: [] as CampaignRoll[]
});
let enqueue: ((entry: RollEntry) => void) | undefined;

function savedQueue(): PendingRoll[] {
	try {
		const saved = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
		return Array.isArray(saved) ? saved.filter((r): r is PendingRoll =>
			r && typeof r.id === 'string' && typeof r.campaignId === 'string' && typeof r.userId === 'string'
			&& typeof r.at === 'number' && Number.isFinite(r.at) && !Number.isNaN(new Date(r.at).getTime())
			&& typeof r.label === 'string' && ['skill', 'stat', 'damage', 'free'].includes(r.kind)
			&& r.result && Array.isArray(r.result.rolls)
			&& typeof r.result.modifier === 'number' && typeof r.result.total === 'number'
			&& typeof r.hidden === 'boolean'
		) : [];
	} catch { return []; }
}
function saveQueue(queue: PendingRoll[]) {
	try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* Device log still works. */ }
}

/** Called after saving the device roll: a network failure cannot prevent rolling. */
export function shareRoll(entry: RollEntry) { enqueue?.(entry); }

/** One session per layout, with all callbacks invalidated on account/campaign changes. */
export function startCampaignRolls(campaignId: string, userId: string | null) {
	sharedRolls.entries = [];
	sharedRolls.member = false;
	sharedRolls.hidden = false;
	sharedRolls.pending = 0;
	sharedRolls.pendingEntries = [];
	sharedRolls.status = '';
	sharedRolls.rejected = 0;
	enqueue = undefined;
	if (!userId) return;

	let active = true;
	let fetching = 0;
	let flushing = false;
	let membershipKnown = false;
	let queue = savedQueue();
	const mine = (r: PendingRoll) => r.campaignId === campaignId && r.userId === userId;
	const count = () => {
		const pending = queue.filter(mine).slice().reverse();
		sharedRolls.pendingEntries = pending;
		sharedRolls.pending = pending.length;
	};
	count();
	const client = supabase();

	async function refresh() {
		if (!active) return;
		const request = ++fetching;
		try {
			const membership = await client.rpc('is_campaign_member', { campaign: campaignId });
			if (!active || request !== fetching) return;
			if (membership.error) throw membership.error;
			membershipKnown = true;
			sharedRolls.member = membership.data === true;
			if (!sharedRolls.member) {
				sharedRolls.entries = [];
				sharedRolls.status = 'Join this campaign to share rolls.';
				return;
			}
			const { data, error } = await client.from('campaign_rolls').select('*')
				.eq('campaign_id', campaignId).order('sequence', { ascending: false }).limit(CAMPAIGN_ROLL_LIMIT);
			if (!active || request !== fetching) return;
			if (error) throw error;
			sharedRolls.entries = (data ?? []).map((r) => ({
				id: r.id, at: Date.parse(r.rolled_at), characterId: r.character_id ?? undefined,
				label: r.label, kind: r.kind, result: r.result, userId: r.user_id, rollerName: r.roller_name, hidden: r.hidden
			}));
			sharedRolls.status = '';
		} catch {
			if (active && request === fetching) {
				// Do not leave private history on screen when permission cannot be checked.
				sharedRolls.entries = [];
				sharedRolls.status = 'Campaign log unavailable. Device rolls still work.';
			}
		}
	}

	async function flush() {
		if (!active || flushing || !sharedRolls.member) return;
		flushing = true;
		let failed = false;
		let posted = false;
		try {
			for (const entry of queue.filter(mine)) {
				if (!active) return;
				const { error, status } = await client.from('campaign_rolls').upsert({
					id: entry.id, campaign_id: campaignId, user_id: userId,
					rolled_at: new Date(entry.at).toISOString(), character_id: entry.characterId ?? null,
					label: entry.label, kind: entry.kind, result: entry.result, hidden: entry.hidden
				}, { onConflict: 'id', ignoreDuplicates: true });
				if (!active) return;
				if (error) {
					// Validation/permission errors cannot succeed unchanged. Leave the
					// device roll intact and let later valid rolls through. Network,
					// server errors, timeouts, throttling and JWT failures stay queued.
					// Auth may refresh after an offline roll's first post attempt.
					const jwtFailure = status === 401 || /^PGRST3/.test(error.code);
					const permanent = !jwtFailure && (/^(22|23)/.test(error.code) || error.code === '42501'
						|| (status >= 400 && status < 500 && status !== 408 && status !== 429));
					if (permanent) {
						sharedRolls.rejected++;
						queue = queue.filter((r) => r.id !== entry.id);
						saveQueue(queue);
						count();
						continue;
					}
					failed = true;
					sharedRolls.status = 'Roll saved on device; campaign post will retry.';
					return;
				}
				posted = true;
				queue = queue.filter((r) => r.id !== entry.id);
				saveQueue(queue);
				count();
			}
			if (posted) await refresh();
		} catch {
			failed = true;
			if (active) sharedRolls.status = 'Roll saved on device; campaign post will retry.';
		} finally {
			flushing = false;
			// Rolls added while a batch was sending should not wait for the next reconnect.
			if (active && !failed && queue.some(mine)) void flush();
		}
	}

	enqueue = (entry) => {
		if (membershipKnown && !sharedRolls.member) return;
		// Store original identity and campaign, never reassign an offline roll later.
		const pending: PendingRoll = { ...entry, campaignId, userId,
			hidden: GM_HIDDEN_ROLLS && sharedRolls.hidden };
		queue = [...queue.filter((r) => !mine(r)), ...queue.filter(mine).slice(-(CAMPAIGN_ROLL_LIMIT - 1)), pending];
		saveQueue(queue);
		count();
		void flush();
	};
	const reconnect = async () => { await refresh(); if (active) await flush(); };
	const channel = client.channel(`rolls:${campaignId}:${userId}`)
		.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_rolls', filter: `campaign_id=eq.${campaignId}` }, () => { void refresh(); })
		.subscribe((status) => {
			if (!active) return;
			if (status === 'SUBSCRIBED') void reconnect(); // snapshot after subscribe closes the initial-load gap
			else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') sharedRolls.status = 'Live log reconnecting…';
		});
	window.addEventListener('online', reconnect);
	// Also recheck membership and catch inserts missed during disconnection.
	const timer = window.setInterval(reconnect, 30_000);
	void reconnect();
	return () => {
		active = false;
		enqueue = undefined;
		sharedRolls.entries = [];
		sharedRolls.member = false;
		sharedRolls.pendingEntries = [];
		sharedRolls.pending = 0;
		window.removeEventListener('online', reconnect);
		window.clearInterval(timer);
		void client.removeChannel(channel);
	};
}
