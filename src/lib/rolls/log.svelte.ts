import type { RollResult } from '#lib/engine/dice.ts';
import {
	capRolls,
	clearRollsFromEntries,
	filterRolls,
	isCriticalRoll,
	isFumbleRoll,
	type RollKind
} from '#lib/rolls/logic.ts';

export type { RollKind } from '#lib/rolls/logic.ts';

export interface RollEntry {
	id: string;
	at: number;
	characterId?: string;
	label: string;
	kind: RollKind;
	result: RollResult;
}

const storageKey = 'cybrdek:rolls';
let hasLoaded = false;
let rolls = $state<RollEntry[]>([]);

function loadRolls(): void {
	if (hasLoaded || typeof localStorage === 'undefined') return;
	hasLoaded = true;

	try {
		const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
		if (Array.isArray(saved)) rolls = capRolls(saved as RollEntry[]);
	} catch {
		// A blocked or malformed browser storage value should never stop the app.
	}
}

function saveRolls(): void {
	if (typeof localStorage === 'undefined') return;

	try {
		localStorage.setItem(storageKey, JSON.stringify(rolls));
	} catch {
		// Private browsing and full storage are both safe failures for the roll log.
	}
}

/** Add a roll to the front of the log and keep 20 entries per log. */
export function logRoll(entry: Omit<RollEntry, 'id' | 'at'>): RollEntry {
	loadRolls();
	const newEntry: RollEntry = { ...entry, id: crypto.randomUUID(), at: Date.now() };
	rolls = capRolls([newEntry, ...rolls]);
	saveRolls();
	return newEntry;
}

/** Reactive, newest first. Supplying an ID selects only that character's rolls. */
export function getRolls(characterId?: string): RollEntry[] {
	loadRolls();
	return filterRolls(rolls, characterId);
}

/** Clear all rolls, or only the rolls belonging to one character. */
export function clearRolls(characterId?: string): void {
	loadRolls();
	rolls = clearRollsFromEntries(rolls, characterId);
	saveRolls();
}

/** A d10 skill/stat check crits only when its first die is 10. */
export function isCrit(entry: RollEntry): boolean {
	return isCriticalRoll(entry);
}

/** A d10 skill/stat check fumbles only when its first die is 1. */
export function isFumble(entry: RollEntry): boolean {
	return isFumbleRoll(entry);
}
