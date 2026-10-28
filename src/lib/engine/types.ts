// Core types shared by every ruleset. A ruleset (e.g. Cyberpunk RED) fills
// these shapes with its own data; the UI only ever reads these shapes.

/** One STAT, e.g. REF (Reflexes). */
export interface StatDef {
	id: string; // short code used everywhere else, e.g. 'REF'
	name: string; // full name, e.g. 'Reflexes'
	min: number; // lowest value allowed at character creation
	max: number; // highest value allowed at character creation
}

/** One skill, e.g. Handgun, linked to REF. */
export interface SkillDef {
	id: string; // e.g. 'handgun'
	name: string; // e.g. 'Handgun'
	stat: string; // the StatDef id this skill adds to, e.g. 'REF'
	category: string; // grouping on the sheet, e.g. 'Ranged Weapon'
	costMultiplier: 1 | 2; // 2 = a (x2) skill that costs double to improve
	basic: boolean; // every character starts with this skill
	specialised?: boolean; // needs a choice when taken, e.g. which Language
	description?: string;
}

/** One Role (character class), e.g. Solo. */
export interface RoleDef {
	id: string; // e.g. 'solo'
	name: string; // e.g. 'Solo'
	ability: string; // the Role Ability's name, e.g. 'Combat Awareness'
}

export interface Character {
	id: string;
	name: string;
	rulesetId: string;
	stats: Record<string, number>;
	skills: Record<string, number>;
	// Ruleset-specific bits (role, IP, etc.) live here until a shared shape is settled.
	extra: Record<string, unknown>;
}

/** Everything one game system provides to the app. */
export interface Ruleset {
	id: string;
	name: string;
	stats: StatDef[];
	skills: SkillDef[];
	skillCategories: string[]; // display order for skill groups
	roles: RoleDef[];
}
