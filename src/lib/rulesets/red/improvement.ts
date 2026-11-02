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
	if (level >= MAX_SKILL_LEVEL) return null;
	return (level + 1) * IP_PER_SKILL_LEVEL * skill.costMultiplier;
}

/** IP to raise the Role Ability from `rank` to `rank + 1`, or null if it's already maxed. */
export function roleRaiseCost(rank: number): number | null {
	if (rank >= MAX_ROLE_RANK) return null;
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
	if (cost === null) return { ok: false, reason: 'Already at the maximum of 10.' };
	if (cost > ip) return { ok: false, reason: `Needs ${cost} IP; you have ${ip}.` };
	const to = from + 1;
	return { ok: true, ip: ip - cost, level: to, spend: { kind, target, from, to, cost } };
}

/** Add IP the GM awarded. Only positive whole numbers count. */
export function awardIp(ip: number, amount: number): number {
	if (!Number.isInteger(amount) || amount <= 0) return ip;
	return ip + amount;
}

/** Read the IP balance safely from a character's free-form `extra`. */
export function ipOf(extra: Record<string, unknown>): number {
	const ip = extra.ip;
	return typeof ip === 'number' && Number.isInteger(ip) && ip >= 0 ? ip : 0;
}

/** Read the spend history safely from a character's free-form `extra`. */
export function ipLogOf(extra: Record<string, unknown>): IpSpend[] {
	return Array.isArray(extra.ipLog) ? (extra.ipLog as IpSpend[]) : [];
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
