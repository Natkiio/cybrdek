// =============================================================================
// improvement.ts: earning and spending Improvement Points (Core p. 409–411)
// =============================================================================
//   The GM awards Improvement Points (IP) after each session. Players spend them
//   to raise a Skill or their Role Ability by ONE Level/Rank at a time. The cost
//   depends on the Level/Rank you are raising it TO:
//
//     Typical skill         new Level × 20    (Level 1 = 20 … Level 10 = 200)
//     Difficult (x2) skill  new Level × 40    (Level 1 = 40 … Level 10 = 400)
//     Role Ability          new Rank  × 60    (Rank 1 = 60  … Rank 10 = 600)
//
//   No skipping: each Level/Rank is bought in turn, even with IP to spare.
//   Skills and Role Abilities top out at 10.
//
//   A character keeps its balance in `extra.ip` and a short history of what it
//   spent in `extra.ipLog`, so a mis-tap can be undone.
// =============================================================================

import type { SkillDef } from '#lib/engine/types.ts';

export const MAX_SKILL_LEVEL = 10;
export const MAX_ROLE_RANK = 10;
export const IP_PER_SKILL_LEVEL = 20;
export const IP_PER_ROLE_RANK = 60;
/** How many past spends we remember for undo. */
export const IP_LOG_LIMIT = 20;

/** One IP spend, newest last in `extra.ipLog`. */
export interface IpSpend {
	kind: 'skill' | 'role';
	/** The skill id, or 'role' for the Role Ability. */
	target: string;
	from: number;
	to: number;
	cost: number;
}

/** What changed after an award, spend or undo; the sheet saves it. */
export interface ImprovementChange {
	ip: number;
	ipLog: IpSpend[];
	skill?: { id: string; level: number };
	roleRank?: number;
}

export type SpendResult =
	| { ok: true; ip: number; level: number; spend: IpSpend }
	| { ok: false; reason: string };

/** IP to raise a skill from `level` to `level + 1`, or null if it's already maxed. */
export function skillRaiseCost(skill: Pick<SkillDef, 'costMultiplier'>, level: number): number | null {
	if (!isLevel(level, MAX_SKILL_LEVEL) || level >= MAX_SKILL_LEVEL) return null;
	return (level + 1) * IP_PER_SKILL_LEVEL * skill.costMultiplier;
}

/** IP to raise the Role Ability from `rank` to `rank + 1`, or null if it's already maxed. */
export function roleRaiseCost(rank: number): number | null {
	if (!isLevel(rank, MAX_ROLE_RANK) || rank >= MAX_ROLE_RANK) return null;
	return (rank + 1) * IP_PER_ROLE_RANK;
}

/** Raise a skill by one Level, paying for it out of `ip`. */
export function raiseSkill(skill: SkillDef, level: number, ip: number): SpendResult {
	return pay('skill', skill.id, level, ip, skillRaiseCost(skill, level));
}

/** Raise the Role Ability by one Rank, paying for it out of `ip`. */
export function raiseRole(rank: number, ip: number): SpendResult {
	return pay('role', 'role', rank, ip, roleRaiseCost(rank));
}

function pay(
	kind: IpSpend['kind'],
	target: string,
	from: number,
	ip: number,
	cost: number | null
): SpendResult {
	// Saved data can be edited or imported, so never trust it to be in range.
	if (!isLevel(from, 10)) return { ok: false, reason: `Invalid current level: ${from}.` };
	if (!isIp(ip)) return { ok: false, reason: `Invalid IP balance: ${ip}.` };
	if (cost === null) return { ok: false, reason: 'Already at the maximum of 10.' };
	if (cost > ip) return { ok: false, reason: `Needs ${cost} IP; you have ${ip}.` };
	const to = from + 1;
	return { ok: true, ip: ip - cost, level: to, spend: { kind, target, from, to, cost } };
}

/** Add IP the GM awarded. Only positive whole numbers count. */
export function awardIp(ip: number, amount: number): number {
	if (!isIp(ip) || !Number.isInteger(amount) || amount <= 0) return ip;
	return ip + amount;
}

/** Read the IP balance safely from a character's free-form `extra`. */
export function ipOf(extra: Record<string, unknown>): number {
	return isIp(extra.ip) ? extra.ip : 0;
}

/** A whole number from 0 to `max`. */
function isLevel(value: unknown, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

/** A whole, non-negative, safe IP amount. */
export function isIp(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * True if `value` is a spend this app could have made: a known kind, a level
 * step of exactly one inside 0–10, and the cost the rules charge for it. When
 * `skillCost` is given it supplies the multiplier for a skill target (and
 * rejects unknown skills by returning undefined).
 */
export function isIpSpend(
	value: unknown,
	skillCost?: (skillId: string) => 1 | 2 | undefined
): value is IpSpend {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	if (!isLevel(v.from, 9) || v.to !== (v.from as number) + 1) return false;
	if (v.kind === 'role') return v.target === 'role' && v.cost === roleRaiseCost(v.from as number);
	if (v.kind !== 'skill' || typeof v.target !== 'string') return false;
	const multiplier = skillCost ? skillCost(v.target) : 1;
	if (multiplier === undefined) return false;
	if (!skillCost) return isIp(v.cost) && v.cost > 0;
	return v.cost === skillRaiseCost({ costMultiplier: multiplier }, v.from as number);
}

/** Read the spend history safely from a character's free-form `extra`. */
export function ipLogOf(extra: Record<string, unknown>): IpSpend[] {
	if (!Array.isArray(extra.ipLog)) return [];
	// A history with any malformed entry can't be undone safely: drop all of it.
	return extra.ipLog.every((spend) => isIpSpend(spend)) ? (extra.ipLog as IpSpend[]) : [];
}

/** Append a spend to the history, keeping only the newest IP_LOG_LIMIT entries. */
export function logSpend(log: IpSpend[], spend: IpSpend): IpSpend[] {
	return [...log, spend].slice(-IP_LOG_LIMIT);
}

export type UndoResult =
	| { ok: true; ip: number; target: string; kind: IpSpend['kind']; level: number; log: IpSpend[] }
	| { ok: false; reason: string };

/**
 * Undo the newest spend: refund its IP and put the skill/rank back.
 * `currentLevel` is the target's level now; if it no longer matches what the
 * spend left behind (edited since), the undo is refused rather than guessing.
 */
export function undoLastSpend(log: IpSpend[], ip: number, currentLevel: number): UndoResult {
	const last = log.at(-1);
	if (!last) return { ok: false, reason: 'Nothing to undo.' };
	if (!isIpSpend(last) || !isIp(ip)) return { ok: false, reason: 'That spend history is damaged.' };
	if (currentLevel !== last.to) return { ok: false, reason: 'That level has changed since; undo it by hand.' };
	return {
		ok: true,
		ip: ip + last.cost,
		target: last.target,
		kind: last.kind,
		level: last.from,
		log: log.slice(0, -1)
	};
}
