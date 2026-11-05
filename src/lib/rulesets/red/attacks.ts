// =============================================================================
// attacks.ts: RED damage-versus-armor choices and shared hit options.
// =============================================================================

/** Damage-form choices, verified against the cited Core pages. */
export type AttackType = 'ranged' | 'melee' | 'martial-arts' | 'brawling' | 'armor-piercing' |
	'rubber' | 'stun-gun' | 'stun-baton' | 'direct' | 'choke' | 'throw';

interface AttackRule {
	label: string;
	hint: string;
	armor: 'full' | 'half' | 'bypass';
	ablation: 0 | 1 | 2;
	floor?: 'rubber' | 'stun';
}

export const ATTACK_RULES: Record<AttackType, AttackRule> = {
	// Core pp. 170, 186: subtract SP, double penetrating aimed head damage, ablate 1.
	ranged: { label: 'Normal ranged attack', hint: 'Full SP; penetrating hits ablate 1. Also use body hits for falling or electrocution (Core pp. 180–181).', armor: 'full', ablation: 1 },
	// Core pp. 176, 178: halve SP and round up. Brawling explicitly uses full SP.
	melee: { label: 'Melee weapon', hint: 'Half SP, rounded up; penetrating hits ablate 1 (Core p. 176).', armor: 'half', ablation: 1 },
	'martial-arts': { label: 'Martial Arts', hint: 'Half SP, rounded up; penetrating hits ablate 1 (Core p. 178).', armor: 'half', ablation: 1 },
	brawling: { label: 'Brawling', hint: 'Full SP; penetrating hits ablate 1 (Core p. 176).', armor: 'full', ablation: 1 },
	// Core p. 345: AP increases ablation, not penetration.
	'armor-piercing': { label: 'Armor-piercing ammunition', hint: 'Full SP; penetrating hits ablate 2, including AP grenades/rockets (Core p. 345).', armor: 'full', ablation: 2 },
	// Core p. 346: the >1 HP / below 0 exception differs from stun weapons.
	rubber: { label: 'Rubber ammunition', hint: 'Full SP; no ablation or Critical Injuries. If HP starts above 1 and would fall below 0, leave 1 HP (Core p. 346).', armor: 'full', ablation: 0, floor: 'rubber' },
	// Core p. 349: these stop at 1 HP and knock the target unconscious.
	'stun-gun': { label: 'Stun Gun', hint: 'Full SP; no ablation or Critical Injuries. A hit that would drop HP below 1 leaves 1 HP and causes unconsciousness (Core p. 349).', armor: 'full', ablation: 0, floor: 'stun' },
	'stun-baton': { label: 'Stun Baton', hint: 'Half SP, rounded up; no ablation or Critical Injuries. Below 1 HP becomes 1 HP and unconsciousness (Core p. 349).', armor: 'half', ablation: 0, floor: 'stun' },
	// Core pp. 180–181, 187, 345–346: direct HP damage never doubles or ablates.
	direct: { label: 'Direct HP (fire / poison / bonus damage)', hint: 'Ignore armor; no ablation or head multiplier. Enter damage after any required save. Apply ongoing fire manually (Core pp. 180–181, 345–346).', armor: 'bypass', ablation: 0 },
	// Core p. 177: use the attacker’s BODY as damage for Choke/Throw.
	choke: { label: 'Choke', hint: 'Enter attacker’s BODY. Direct HP; no ablation or head multiplier. Above 1 HP to below 0 leaves 1 HP, unconscious. Three successive choke rounds also cause unconsciousness (Core p. 177).', armor: 'bypass', ablation: 0, floor: 'rubber' },
	throw: { label: 'Grapple: throw to ground', hint: 'Enter attacker’s BODY. Direct HP; no ablation or head multiplier (Core p. 177).', armor: 'bypass', ablation: 0 }
};

export interface DamageOptions {
	attackType?: AttackType;
	/** Core p. 188: Cracked Skull changes aimed head damage to ×3. */
	headMultiplier?: 2 | 3;
}

/** Core p. 188: tolerate legacy characters with no saved Critical Injuries. */
export function headMultiplierOf(extra: Record<string, unknown>): 2 | 3 {
	return Array.isArray(extra.criticalInjuries) && extra.criticalInjuries.some((injury) =>
		injury && typeof injury === 'object' && injury.location === 'head' && injury.roll === 9
	) ? 3 : 2;
}
