import { supabase } from '#lib/supabase/client.ts';
import { hasOwnedReceipt, updateOwnedCharacterOnce, type StillCurrent } from '#lib/storage/characters.ts';
import { derivedStats } from '#lib/rulesets/red/derived.ts';
import { clampHp } from '#lib/rulesets/red/wounds.ts';
export interface DamageOffer { encounterId: string; characterId: string; name: string; damage: number; endedAt: string }
export const damageReceipt = (owner: string, offer: DamageOffer) => `fight-damage:${owner}:${offer.encounterId}`;
export async function readDamageOffers(campaign: string, owner: string): Promise<DamageOffer[] | { error: string }> {
	const { data, error } = await supabase().rpc('campaign_damage_offers', { campaign, owner }).abortSignal(AbortSignal.timeout(10000));
	if (error || !Array.isArray(data)) return { error: 'Could not check finished fights. Refresh when online.' };
	// Only account-owned working copies can accept a change. Receipts travel
	// with their private sheet through the existing sync and backup mechanisms.
	const checks = await Promise.all(data.map(async (offer: DamageOffer) =>
		(await hasOwnedReceipt(owner, offer.characterId, damageReceipt(owner, offer))) === false ? offer : null));
	return checks.filter((o): o is DamageOffer => o !== null);
}
export async function acceptDamage(owner: string, offer: DamageOffer, current: StillCurrent): Promise<boolean> {
	if (!Number.isInteger(offer.damage) || offer.damage < 1 || offer.damage > 10000
		|| !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offer.encounterId)) throw new Error('This fight result could not be read.');
	return updateOwnedCharacterOnce(owner, offer.characterId, damageReceipt(owner, offer), character => {
		const maxHp = derivedStats(character.stats).hp;
		const hp = Number(character.extra.currentHp ?? maxHp);
		if (!Number.isFinite(maxHp) || !Number.isFinite(hp)) throw new Error('This character’s HP could not be read.');
		return { ...character, extra: { ...character.extra, currentHp: clampHp(hp - offer.damage, maxHp) } };
	}, current);
}
