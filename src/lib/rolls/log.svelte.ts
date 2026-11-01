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

/** Read saved rolls once, when this module first loads in the browser. */
function loadSavedRolls(): RollEntry[] {
	if (typeof localStorage === 'undefined') return [];

	try {
		const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
		return Array.isArray(saved) ? capRolls(saved as RollEntry[]) : [];
	} catch {
		// A blocked or malformed browser storage value should never stop the app.
		return [];
	}
}

// Loaded eagerly, not lazily inside getRolls(): components call getRolls() inside
// $derived, and Svelte 5 doesn't allow changing state while a $derived is computing.
let rolls = $state<RollEntry[]>(loadSavedRolls());

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
	const newEntry: RollEntry = { ...entry, id: crypto.randomUUID(), at: Date.now() };
	rolls = capRolls([newEntry, ...rolls]);
	saveRolls();
	return newEntry;
}

/** Reactive, newest first. Supplying an ID selects only that character's rolls. */
export function getRolls(characterId?: string): RollEntry[] {
	return filterRolls(rolls, characterId);
}

/** Clear all rolls, or only the rolls belonging to one character. */
export function clearRolls(characterId?: string): void {
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
