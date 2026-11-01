import type { RollResult } from '#lib/engine/dice.ts';

export type RollKind = 'skill' | 'stat' | 'damage' | 'free';

export interface RollLike {
	characterId?: string;
	kind: RollKind;
	result: RollResult;
}

/** Keeps the newest 20 rolls in each character's (or shared) log. */
export function capRolls<T extends RollLike>(entries: T[]): T[] {
	const seen = new Map<string, number>();

	return entries.filter((entry) => {
		const key = entry.characterId === undefined ? '__shared__' : entry.characterId;
		const count = seen.get(key) ?? 0;
		seen.set(key, count + 1);
		return count < 20;
	});
}

export function filterRolls<T extends RollLike>(entries: T[], characterId?: string): T[] {
	return characterId === undefined ? entries : entries.filter((entry) => entry.characterId === characterId);
}

export function clearRollsFromEntries<T extends RollLike>(entries: T[], characterId?: string): T[] {
	return characterId === undefined ? [] : entries.filter((entry) => entry.characterId !== characterId);
}

export function isCriticalRoll(entry: RollLike): boolean {
	return (entry.kind === 'skill' || entry.kind === 'stat') && entry.result.rolls[0] === 10;
}

export function isFumbleRoll(entry: RollLike): boolean {
	return (entry.kind === 'skill' || entry.kind === 'stat') && entry.result.rolls[0] === 1;
}
