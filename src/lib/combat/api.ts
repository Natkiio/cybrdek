import { supabase } from '#lib/supabase/client.ts';
import type { Character } from '#lib/engine/types.ts';
import { exportCharacter, parseCharacterFile } from '#lib/storage/backup.ts';
import { parseEncounter, type Encounter } from './encounter.ts';

export interface VisibleCombatant {
	id: string; name: string; side: 'pc' | 'npc';
	wound: 'unhurt' | 'lightly' | 'seriously' | 'mortally' | 'dead';
	// These fields exist only for the authenticated owner's PC. No raw gear/stats.
	characterId?: string; hp?: number; maxHp?: number; sp?: { head: number; body: number };
}
export interface PlayerEncounter {
	started: boolean; round: number; currentId: string | null; combatants: VisibleCombatant[];
}
interface Fight { id: string | null; revision: number; ended: boolean }
export type EncounterView = Fight & (
	{ canManage: true; encounter: Encounter } | { canManage: false; encounter: PlayerEncounter }
);
export interface PartyCharacter { key: string; ownerId: string; character: Character }
export interface ApiError { error: string; conflict?: boolean }
const timeout = () => AbortSignal.timeout(10_000);

function decoded(data: EncounterView): EncounterView {
	return data.canManage ? { ...data, encounter: parseEncounter(data.encounter) } : data;
}
export async function readEncounter(campaign: string, owner: string): Promise<EncounterView | ApiError> {
	const { data, error } = await supabase().rpc('campaign_encounter_view', { campaign, owner }).abortSignal(timeout());
	return error || !data ? { error: 'Could not read the campaign fight. Check your connection and membership.' } : decoded(data);
}
export async function writeEncounter(campaign: string, owner: string, view: Fight, snapshot: Encounter, finish = false): Promise<EncounterView | ApiError> {
	const { data, error } = await supabase().rpc('save_campaign_encounter', {
		campaign, owner, fight_id: view.id, expected_revision: view.revision, snapshot, finish
	}).abortSignal(timeout());
	if (error || !data) return { error: error?.code === '40001'
		? 'The fight changed elsewhere. Refreshed; review it before trying again.'
		: 'Could not save the campaign fight. Your change has not been applied.', conflict: error?.code === '40001' };
	return decoded(data);
}
export async function readParty(campaign: string): Promise<PartyCharacter[] | ApiError> {
	const { data, error } = await supabase().from('characters').select('user_id,id,data')
		.eq('campaign_id', campaign).is('deleted_at', null).abortSignal(timeout());
	if (error || !data) return { error: 'Could not load campaign characters.' };
	return data.flatMap(row => {
		try {
			const result = parseCharacterFile(exportCharacter(row.data));
			return result.ok ? [{ key: `${row.user_id}/${row.id}`, ownerId: row.user_id,
				character: { ...result.character, id: row.id } }] : [];
		} catch { return []; }
	});
}
