// =============================================================================
// injuries.ts: RED Critical Injuries (Core pp. 187–188, 221–223).
// Stored results stay in character.extra; definitions and ongoing modifiers live here.
// =============================================================================

import type { ArmorLocation } from './gear.ts';
import { clampHp } from './wounds.ts';

export interface CriticalInjury { location: ArmorLocation; roll: number }
export interface InjuryDefinition {
	name: string;
	effect: string;
	actions?: number;
	move?: number;
	deathSave?: number;
}

// Core pp. 187–188 (also pp. 221–222). Effects are condensed in our own words.
export const CRITICAL_INJURIES: Record<ArmorLocation, Record<number, InjuryDefinition>> = {
	body: {
		2: { name: 'Dismembered Arm', effect: 'Arm lost; drop what its hand holds. Base Death Save penalty +1.', deathSave: 1 },
		3: { name: 'Dismembered Hand', effect: 'Hand lost; drop its contents. Base Death Save penalty +1.', deathSave: 1 },
		4: { name: 'Collapsed Lung', effect: 'MOVE −2 (minimum 1). Base Death Save penalty +1.', move: -2, deathSave: 1 },
		5: { name: 'Broken Ribs', effect: 'After a turn moving over 4 m on foot, take another 5 direct HP damage.' },
		6: { name: 'Broken Arm', effect: 'Arm unusable; drop what its hand holds.' },
		7: { name: 'Foreign Object', effect: 'After a turn moving over 4 m on foot, take another 5 direct HP damage.' },
		8: { name: 'Broken Leg', effect: 'MOVE −4 (minimum 1).', move: -4 },
		9: { name: 'Torn Muscle', effect: 'Melee attacks −2.' },
		10: { name: 'Spinal Injury', effect: 'Next turn: only a Move Action, no other Action. Base Death Save penalty +1.', deathSave: 1 },
		11: { name: 'Crushed Fingers', effect: 'Actions using the affected hand −4.' },
		12: { name: 'Dismembered Leg', effect: 'Leg lost; MOVE −6 (minimum 1); cannot dodge. Base Death Save penalty +1.', move: -6, deathSave: 1 }
	},
	head: {
		2: { name: 'Lost Eye', effect: 'Eye lost; ranged attacks and visual Perception −4. Base Death Save penalty +1.', deathSave: 1 },
		3: { name: 'Brain Injury', effect: 'All actions −2. Base Death Save penalty +1.', actions: -2, deathSave: 1 },
		4: { name: 'Damaged Eye', effect: 'Ranged attacks and visual Perception −2.' },
		5: { name: 'Concussion', effect: 'All actions −2.', actions: -2 },
		6: { name: 'Broken Jaw', effect: 'Actions involving speech −4.' },
		7: { name: 'Foreign Object', effect: 'After a turn moving over 4 m on foot, take another 5 direct HP damage.' },
		8: { name: 'Whiplash', effect: 'Base Death Save penalty +1.', deathSave: 1 },
		9: { name: 'Cracked Skull', effect: 'Aimed head hits multiply penetrating damage by 3. Base Death Save penalty +1.', deathSave: 1 },
		10: { name: 'Damaged Ear', effect: 'Hearing Perception −2; moving over 4 m on foot prevents a Move Action next turn.' },
		11: { name: 'Crushed Windpipe', effect: 'Cannot speak. Base Death Save penalty +1.', deathSave: 1 },
		12: { name: 'Lost Ear', effect: 'Ear lost; hearing Perception −4; moving over 4 m on foot prevents a Move Action next turn. Base Death Save penalty +1.', deathSave: 1 }
	}
};

export function injuryKey(injury: CriticalInjury): string {
	return `${injury.location}:${injury.roll}`;
}

export function validInjuries(value: unknown): value is CriticalInjury[] {
	if (!Array.isArray(value) || value.length > 22) return false;
	const keys = new Set<string>();
	for (const injury of value) {
		if (!injury || typeof injury !== 'object' || Array.isArray(injury) ||
			!['body', 'head'].includes(injury.location) || !Number.isInteger(injury.roll) ||
			injury.roll < 2 || injury.roll > 12) return false;
		const key = injuryKey(injury);
		if (keys.has(key)) return false;
		keys.add(key);
	}
	return true;
}

export function injuriesOf(extra: Record<string, unknown>): CriticalInjury[] {
	return validInjuries(extra.criticalInjuries) ? extra.criticalInjuries : [];
}

export function injuryModifiers(injuries: CriticalInjury[]) {
	const definitions = injuries.map((i) => CRITICAL_INJURIES[i.location][i.roll]);
	return {
		actions: definitions.reduce((n, i) => n + (i.actions ?? 0), 0),
		move: definitions.reduce((n, i) => n + (i.move ?? 0), 0),
		deathSave: definitions.reduce((n, i) => n + (i.deathSave ?? 0), 0),
		headMultiplier: injuries.some((i) => i.location === 'head' && i.roll === 9) ? 3 : 2
	};
}

/** Core p. 187: a new injury adds 5 direct HP damage, without armor ablation or head doubling. */
export function receiveInjury(injuries: CriticalInjury[], injury: CriticalInjury, hp: number, maxHp: number) {
	if (!validInjuries([...injuries, injury])) return { criticalInjuries: injuries, currentHp: hp };
	return { criticalInjuries: [...injuries, injury], currentHp: clampHp(hp - 5, maxHp) };
}
