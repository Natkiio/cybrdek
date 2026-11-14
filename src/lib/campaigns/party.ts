// Which character plays in a campaign, and the GM's view of the party (#52).
// Row-level security decides who gets what; this file just asks.

import type { Character } from '#lib/engine/types.ts';
import { derivedStats } from '#lib/rulesets/red/derived.ts';
import { ipOf } from '#lib/rulesets/red/improvement.ts';
import { clampHp, WOUND_LABELS, woundState, type WoundState } from '#lib/rulesets/red/wounds.ts';
import { wornSp } from '#lib/rulesets/red/armor.ts';
import { cyberwareOf, humanityOf, maxHumanity } from '#lib/rulesets/red/cyberware.ts';
import { gearOf } from '#lib/rulesets/red/gear.ts';
import { CRITICAL_INJURIES, injuriesOf } from '#lib/rulesets/red/injuries.ts';
import { rulesets } from '#lib/rulesets/index.ts';
import { exportCharacter, parseCharacterFile } from '#lib/storage/backup.ts';
import { supabase } from '#lib/supabase/client.ts';

const TIMEOUT_MS = 10000;

export interface MyCharacter {
	id: string;
	name: string;
	campaignId: string | null;
}

export interface PartyMember {
	key: string;
	name: string;
	role: string;
	rank: number;
	hp: number;
	maxHp: number;
	ip: number;
	// For the live GM dashboard (#53)
	wound: WoundState;
	woundLabel: string;
	sp: { head: number; body: number };
	stats: Record<string, number>;
	humanity: number;
	maxHumanity: number;
	injuries: string[]; // names of active Critical Injuries
	character: Character; // the whole sheet, for the read-only view
}

/** Only a character the app can really open: other people's data is never trusted. */
function readCharacter(data: unknown): Character | undefined {
	try {
		const result = parseCharacterFile(exportCharacter(data as Character));
		return result.ok ? result.character : undefined;
	} catch {
		return undefined;
	}
}

/** What the GM's list shows for one character. */
export function summarise(key: string, data: unknown): PartyMember | undefined {
	const character = readCharacter(data);
	if (!character) return undefined;
	const ruleset = rulesets.find((r) => r.id === character.rulesetId);
	const maxHp = derivedStats(character.stats).hp;
	const hp = clampHp(Number(character.extra.currentHp ?? maxHp), maxHp);
	const wound = woundState(hp, maxHp);
	const emp = Number(character.stats.EMP ?? 0);
	return {
		key,
		name: character.name,
		role: ruleset?.roles.find((r) => r.id === character.extra.role)?.name ?? 'No Role',
		rank: Number(character.extra.roleRank ?? 4),
		hp,
		maxHp,
		ip: ipOf(character.extra),
		wound,
		woundLabel: WOUND_LABELS[wound],
		sp: wornSp(gearOf(character.extra)),
		stats: { ...character.stats },
		humanity: humanityOf(character.extra, emp),
		maxHumanity: maxHumanity(emp, cyberwareOf(character.extra)),
		injuries: injuriesOf(character.extra).map(
			(injury) => CRITICAL_INJURIES[injury.location][injury.roll]?.name ?? 'Critical Injury'
		),
		character
	};
}

/** This player's characters in the cloud. */
export async function listMyCharacters(userId: string): Promise<MyCharacter[] | { error: string }> {
	const { data, error } = await supabase()
		.from('characters')
		.select('id, data, campaign_id')
		.eq('user_id', userId)
		.is('deleted_at', null)
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
	if (error || !data) return { error: 'Your characters need a connection.' };
	return data
		.flatMap((row) => {
			const character = readCharacter(row.data);
			return character ? [{ id: row.id as string, name: character.name, campaignId: row.campaign_id as string | null }] : [];
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Put a character in a campaign, or take it out with null. Returns an error or null. */
export async function setCharacterCampaign(id: string, campaignId: string | null): Promise<string | null> {
	const { error } = await supabase().rpc('set_character_campaign', { character_id: id, campaign: campaignId });
	return error ? error.message : null;
}

/** The characters in a campaign that this GM may read. */
export async function listParty(campaignId: string): Promise<PartyMember[] | { error: string }> {
	const { data, error } = await supabase()
		.from('characters')
		.select('user_id, id, data')
		.eq('campaign_id', campaignId)
		.is('deleted_at', null)
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
	if (error || !data) return { error: 'The party list needs a connection.' };
	return data
		.flatMap((row) => summarise(`${row.user_id}/${row.id}`, row.data) ?? [])
		.sort((a, b) => a.name.localeCompare(b.name));
}
