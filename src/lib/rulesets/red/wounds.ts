import { damageThroughArmor } from './armor.ts';
import type { ArmorLocation, GearItem } from './gear.ts';
// =============================================================================
// wounds.ts: Cyberpunk RED Wound States and Death Saves (Core p. 220–221)
// =============================================================================
//   Unhurt             full HP
//   Lightly Wounded    less than full HP                 no penalty
//   Seriously Wounded  less than half HP (rounded up)    −2 to all Actions
//   Mortally Wounded   less than 1 HP                    −4 to all Actions, −6 MOVE (min 1),
//                                                        Death Save at the start of each Turn
//
//   Death Save: roll a d10 + Death Save Penalty. Under BODY = you live.
//   A natural 10 always fails. Every Death Save raises the penalty by 1.
// =============================================================================

import { seriouslyWoundedThreshold } from './derived.ts';

export type WoundState = 'unhurt' | 'lightly' | 'seriously' | 'mortally';

export const WOUND_LABELS: Record<WoundState, string> = {
	unhurt: 'Unhurt',
	lightly: 'Lightly Wounded',
	seriously: 'Seriously Wounded',
	mortally: 'Mortally Wounded'
};

/** Keep HP between 0 and max. */
export function clampHp(hp: number, maxHp: number): number {
	return Math.min(maxHp, Math.max(0, Math.round(hp)));
}

/** Which Wound State a character is in. 40 max HP: 40 unhurt, 39 lightly, 19 seriously, 0 mortally. */
export function woundState(hp: number, maxHp: number): WoundState {
	if (hp < 1) return 'mortally';
	if (hp < seriouslyWoundedThreshold(maxHp)) return 'seriously';
	if (hp < maxHp) return 'lightly';
	return 'unhurt';
}

/** Penalty to every Action (skill and STAT checks) from the Wound State. */
export function actionPenalty(state: WoundState): number {
	if (state === 'mortally') return -4;
	if (state === 'seriously') return -2;
	return 0;
}

/** MOVE after wounds: −6 when Mortally Wounded, never below 1. */
export function woundedMove(move: number, state: WoundState): number {
	return state === 'mortally' ? Math.max(1, move - 6) : move;
}

export interface DeathSaveResult {
	die: number;
	penalty: number;
	total: number;
	body: number;
	survived: boolean;
}

/** Resolve a Death Save from a d10 roll. */
export function resolveDeathSave(die: number, penalty: number, body: number): DeathSaveResult {
	const total = die + penalty;
	return { die, penalty, total, body, survived: die !== 10 && total < body };
}

/** Core pp. 170, 186: armor first; aimed head hits double damage that penetrates. */
export function takeArmoredDamage(
	hp: number, maxHp: number, gear: GearItem[], damage: number, location: ArmorLocation
) {
	const result = damageThroughArmor(gear, damage, location);
	const hpDamage = result.penetrating * (location === 'head' ? 2 : 1);
	return { ...result, hpDamage, hp: clampHp(hp - hpDamage, maxHp) };
}
