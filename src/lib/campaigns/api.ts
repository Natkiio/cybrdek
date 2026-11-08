// Campaigns through Supabase (browser only). Joining and creating go through
// database functions; row-level security decides everything else.

import { supabase } from '#lib/supabase/client.ts';

export type CampaignRole = 'gm' | 'player';

export interface CampaignRow {
	id: string;
	name: string;
	is_public: boolean;
}

export interface CampaignListing extends CampaignRow {
	role: CampaignRole | null; // null = a public campaign you haven't joined
}

/** Add this user's role to each campaign, your own first, then by name. */
export function withRoles(
	campaigns: readonly CampaignRow[],
	memberships: readonly { campaign_id: string; role: CampaignRole }[]
): CampaignListing[] {
	const roles = new Map(memberships.map((m) => [m.campaign_id, m.role]));
	return campaigns
		.map((c) => ({ ...c, role: roles.get(c.id) ?? null }))
		.sort((a, b) => Number(b.role !== null) - Number(a.role !== null) || a.name.localeCompare(b.name));
}

/** The link that invites someone to a campaign. */
export const inviteLink = (origin: string, code: string) => `${origin}/join/${code}`;

export async function listCampaigns(userId: string | null): Promise<CampaignListing[]> {
	const { data, error } = await supabase().from('campaigns').select('id,name,is_public');
	if (error || !data) return [];
	if (!userId) return withRoles(data as CampaignRow[], []);
	const members = await supabase().from('campaign_members').select('campaign_id,role').eq('user_id', userId);
	return withRoles(data as CampaignRow[], (members.data ?? []) as { campaign_id: string; role: CampaignRole }[]);
}

export async function createCampaign(name: string): Promise<{ id: string } | { error: string }> {
	const { data, error } = await supabase().rpc('create_campaign', { campaign_name: name.trim() });
	return error ? { error: error.message } : { id: data as string };
}

export async function joinCampaign(code: string): Promise<CampaignRow | { error: string }> {
	const { data, error } = await supabase().rpc('join_campaign', { invite_code: code });
	if (error) return { error: error.code === 'P0002' ? 'That invite link is not valid.' : error.message };
	const found = await supabase().from('campaigns').select('id,name,is_public').eq('id', data as string).single();
	return found.error ? { error: found.error.message } : (found.data as CampaignRow);
}

/** The invite code, for a GM of this campaign; null for everyone else. */
export async function inviteCode(campaignId: string): Promise<string | null> {
	const { data } = await supabase().from('campaign_invites').select('code').eq('campaign_id', campaignId).maybeSingle();
	return (data as { code: string } | null)?.code ?? null;
}

/** The current member's chosen name at this table; null when not a member. */
export async function campaignDisplayName(campaignId: string, userId: string): Promise<string | null> {
	const { data, error } = await supabase().from('campaign_members').select('display_name')
		.eq('campaign_id', campaignId).eq('user_id', userId).maybeSingle();
	return !error && data ? data.display_name ?? 'Player' : null;
}

/** Membership and identity are checked by the database function. */
export async function setCampaignDisplayName(campaignId: string, name: string): Promise<string | null> {
	const { error } = await supabase().rpc('set_campaign_display_name', { campaign: campaignId, member_name: name.trim() });
	return error ? 'Could not save your name. Check your connection and campaign membership.' : null;
}
