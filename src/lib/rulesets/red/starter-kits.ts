// Starter gear (#100): the Netrunner's Streetrat kit, offered in character
// creation so a new Netrunner starts with a working deck (Core p. 103).
// Our creation uses the Complete Package, which buys gear with eb instead
// (Core p. 86); this kit is an optional shortcut from the Streetrat method.
import type { GearItem } from './gear.ts';
import { newDeck } from './cyberdeck.ts';
import { PROGRAMS } from './programs.ts';

export const NETRUNNER_KIT = {
	page: 103,
	/** Always included. */
	programs: ['armor', 'sword'],
	/** Pick one from each pair. */
	choices: [
		['see-ya', 'eraser'],
		['sword', 'vrizzbolt'],
		['worm', 'sword']
	]
} as const;

export type KitPicks = readonly string[];

/** The first option of each pair. */
export const defaultPicks = (): string[] => NETRUNNER_KIT.choices.map((pair) => pair[0]);

export const programName = (id: string) => PROGRAMS.find((p) => p.id === id)?.name ?? id;

/** Problems with the picks: one valid option per pair. */
export function validatePicks(picks: KitPicks): string[] {
	return NETRUNNER_KIT.choices.length === picks.length &&
		NETRUNNER_KIT.choices.every((pair, i) => (pair as readonly string[]).includes(picks[i]))
		? []
		: ['Pick one program from each starter pair.'];
}

/**
 * The kit as sheet gear: a Standard Cyberdeck (7 slots) with every program
 * loaded, plus Virtuality Goggles so the runner can see Meatspace (Core p. 197).
 */
export function netrunnerKit(picks: KitPicks, newId: () => string = () => crypto.randomUUID()): GearItem[] {
	if (validatePicks(picks).length) throw new Error('Invalid starter picks.');
	const deck = newDeck();
	deck.programs = [...NETRUNNER_KIT.programs, ...picks].map((defId) => ({ id: newId(), defId, loaded: true }));
	return [
		{ id: newId(), kind: 'item', name: 'Cyberdeck', quantity: 1, cyberdeck: deck },
		{ id: newId(), kind: 'item', name: 'Virtuality Goggles', quantity: 1 }
	];
}
