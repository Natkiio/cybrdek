// =============================================================================
// creation.ts: Cyberpunk RED "Complete Package" character creation (Core p. 74, p. 86)
// =============================================================================
//   STATs:  62 points split across the 10 STATs. Every STAT is 2–8.
//   Skills: 86 points. No skill above 6. Basic skills must be at least 2.
//           (x2) skills cost 2 points per level, everything else costs 1.
//   Role:   every starting character's Role Ability is rank 4.
// =============================================================================

import type { Character, Ruleset } from '#lib/engine/types.ts';
import { roles } from './roles.ts';
import { skills } from './skills.ts';
import { stats } from './stats.ts';

export const STAT_POINTS = 62;
export const SKILL_POINTS = 86;
export const SKILL_MAX = 6;
export const BASIC_SKILL_MIN = 2;
export const STARTING_ROLE_RANK = 4;

/** Every STAT at 6: an even split with 2 points left over. */
export function defaultStats(): Record<string, number> {
	return Object.fromEntries(stats.map((s) => [s.id, 6]));
}

/** Every skill at 0, except Basic skills which start at the required 2. */
export function defaultSkills(): Record<string, number> {
	return Object.fromEntries(skills.map((s) => [s.id, s.basic ? BASIC_SKILL_MIN : 0]));
}

/** Total STAT points spent. */
export function statPointsSpent(values: Record<string, number>): number {
	return stats.reduce((total, s) => total + (values[s.id] ?? 0), 0);
}

/** Total skill points spent: level × cost multiplier, summed. */
export function skillPointsSpent(levels: Record<string, number>): number {
	return skills.reduce((total, s) => total + (levels[s.id] ?? 0) * s.costMultiplier, 0);
}

/** Problems with the STATs, in plain words. An empty list means they're valid. */
export function validateStats(values: Record<string, number>): string[] {
	const problems: string[] = [];
	for (const s of stats) {
		const v = values[s.id];
		if (!Number.isInteger(v)) problems.push(`${s.id} is missing.`);
		else if (v < s.min || v > s.max) problems.push(`${s.id} must be ${s.min}–${s.max}.`);
	}
	const spent = statPointsSpent(values);
	if (spent > STAT_POINTS) problems.push(`${spent - STAT_POINTS} STAT points over the ${STAT_POINTS} limit.`);
	if (spent < STAT_POINTS) problems.push(`${STAT_POINTS - spent} STAT points left to spend.`);
	return problems;
}

/** Problems with the skills. Unspent skill points are allowed (just wasteful). */
export function validateSkills(levels: Record<string, number>): string[] {
	const problems: string[] = [];
	for (const s of skills) {
		const v = levels[s.id] ?? 0;
		if (!Number.isInteger(v) || v < 0) problems.push(`${s.name} has an invalid level.`);
		else if (v > SKILL_MAX) problems.push(`${s.name} can't be above ${SKILL_MAX}.`);
		else if (s.basic && v < BASIC_SKILL_MIN) problems.push(`${s.name} is a Basic skill and must be at least ${BASIC_SKILL_MIN}.`);
	}
	const spent = skillPointsSpent(levels);
	if (spent > SKILL_POINTS) problems.push(`${spent - SKILL_POINTS} skill points over the ${SKILL_POINTS} limit.`);
	return problems;
}

/** Problems with the handle (character name). */
export function validateHandle(handle: string): string[] {
	return handle.trim() ? [] : ['Your character needs a handle.'];
}

/** Problems with the chosen Role. */
export function validateRole(roleId: string): string[] {
	return roles.some((r) => r.id === roleId) ? [] : ['Pick a Role.'];
}

export interface CreationInput {
	handle: string;
	role: string;
	stats: Record<string, number>;
	skills: Record<string, number>;
}

/** Every problem across every step. */
export function validateCreation(input: CreationInput): string[] {
	return [
		...validateHandle(input.handle),
		...validateRole(input.role),
		...validateStats(input.stats),
		...validateSkills(input.skills)
	];
}

/** Turn a finished, valid wizard into a Character ready to save. */
export function buildCharacter(input: CreationInput, ruleset: Ruleset, id: string): Character {
	const problems = validateCreation(input);
	if (problems.length) throw new Error(`Invalid character: ${problems.join(' ')}`);
	return {
		id,
		name: input.handle.trim(),
		rulesetId: ruleset.id,
		stats: { ...input.stats },
		// Only keep skills the character actually has.
		skills: Object.fromEntries(Object.entries(input.skills).filter(([, level]) => level > 0)),
		extra: { role: input.role, roleRank: STARTING_ROLE_RANK, method: 'complete-package' }
	};
}
