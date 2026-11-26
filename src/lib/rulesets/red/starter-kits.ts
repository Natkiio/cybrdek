// Starter gear (#100): the Netrunner's Streetrat kit, offered in character
// creation so a new Netrunner starts ready to run: a loaded deck (Core p. 103)
// and the Neural Link and Interface Plugs a deck needs (Core pp. 117, 196).
// Our creation uses the Complete Package, which buys gear with eb instead
// (Core p. 104); this kit is an optional shortcut from the Streetrat method.
import type { GearItem } from './gear.ts';
import { cyberwareDef, type InstalledCyberware } from './cyberware.ts';
import { newDeck } from './cyberdeck.ts';
import { PROGRAMS } from './programs.ts';

export const NETRUNNER_KIT = {
	page: 103,
	cyberwarePage: 117,
	/** Installed in this order; Interface Plugs sit in the Neural Link. */
	cyberware: ['neural-link', 'interface-plugs', 'shift-tacts'],
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

/**
 * The kit's cyberware, with the preset Humanity Loss the Streetrat method
 * uses (Core pp. 111, 117): 14 in all for a Netrunner.
 */
export function netrunnerKitCyberware(newId: () => string = () => crypto.randomUUID()): InstalledCyberware[] {
	const installed: InstalledCyberware[] = [];
	for (const defId of NETRUNNER_KIT.cyberware) {
		const def = cyberwareDef(defId)!;
		const host = def.hosts?.length ? installed.find((i) => def.hosts!.includes(i.defId)) : undefined;
		installed.push({ id: newId(), defId, ...(host ? { hostId: host.id } : {}), hl: def.hl });
	}
	return installed;
}

/** Humanity Loss from the kit's cyberware. */
export const kitHumanityLoss = (installed: readonly InstalledCyberware[]) => installed.reduce((n, i) => n + i.hl, 0);
