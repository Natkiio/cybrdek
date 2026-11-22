// The Netrunner's Interface (#100, part 3). Core pp. 197–201. Names, numbers
// and our own short summaries only, no rulebook text.
import { PROGRAMS } from './programs.ts';
import type { Cyberdeck } from './cyberdeck.ts';

/** NET Actions per Turn by Interface Rank (Core p. 197): 1–3 → 2, 4–6 → 3, 7–9 → 4, 10 → 5. */
export function netActions(rank: number): number {
	if (!Number.isFinite(rank) || rank < 1) return 0; // no Interface, no Netrunning
	if (rank >= 10) return 5;
	if (rank >= 7) return 4;
	if (rank >= 4) return 3;
	return 2;
}

export interface InterfaceAbility {
	id: string;
	name: string;
	/** What the roll is against (Core pp. 198–201). */
	against: string;
	summary: string;
	/** Scanner is a Meat Action; every other ability costs a NET Action (Core p. 198). */
	meatAction?: true;
	/** Zap deals 1d6 on a hit, to a Program's REZ or a Netrunner's brain (Core p. 201). */
	damage?: { count: number; sides: number };
	/** The Booster program whose bonus applies while it's running (Core p. 203). */
	booster?: string;
}

// Every ability rolls Interface + 1d10 (Core p. 198).
export const INTERFACE_ABILITIES: readonly InterfaceAbility[] = [
	{ id: 'scanner', name: 'Scanner', meatAction: true, against: 'GM decides what you find', summary: 'Find nearby access points in meatspace. Higher finds more, further away.' },
	{ id: 'backdoor', name: 'Backdoor', booster: 'worm', against: "the Password's DV", summary: 'Break through a Password.' },
	{ id: 'cloak', name: 'Cloak', booster: 'eraser', against: 'no DV: your roll is the DV to find you', summary: 'Hide your traces and any Virus you left.' },
	{ id: 'control', name: 'Control', against: "the Control Node's DV", summary: 'Take a Control Node; each thing it runs then takes its own NET Action.' },
	{ id: 'eye-dee', name: 'Eye-Dee', against: "the File's DV, if it has one", summary: 'Learn what a File is and what it’s worth.' },
	{ id: 'pathfinder', name: 'Pathfinder', booster: 'see-ya', against: 'no DV: see floors up to your roll', summary: 'Map the Architecture ahead, stopping at an obstruction with a higher DV.' },
	{ id: 'slide', name: 'Slide', against: "Black ICE's Perception + 1d10", summary: 'Escape one non-Demon Black ICE to an adjacent floor. Once per Turn.' },
	{ id: 'virus', name: 'Virus', against: 'a DV the GM sets', summary: 'At the lowest floor only: leave a lasting change. The GM sets the NET Actions it takes.' },
	{ id: 'zap', name: 'Zap', damage: { count: 1, sides: 6 }, against: "a Program's DEF + 1d10, or a Netrunner's Interface + 1d10", summary: 'Basic attack on a Program or Netrunner. 1d6 to REZ or brain on a hit.' }
];

/** The bonus a running Booster gives an ability, e.g. Worm +2 to Backdoor. */
export function boosterBonus(ability: InterfaceAbility, running: ReadonlySet<string>): number {
	if (!ability.booster || !running.has(ability.booster)) return 0;
	const program = PROGRAMS.find((p) => p.id === ability.booster);
	const bonus = program?.numbers[`${ability.name} bonus`];
	return typeof bonus === 'number' ? bonus : 0;
}

/** The Booster programs loaded on any of these decks: the ones that could be running. */
export function loadedBoosters(decks: readonly Cyberdeck[]): string[] {
	const ids = new Set<string>();
	for (const deck of decks)
		for (const copy of deck.programs)
			if (copy.loaded && PROGRAMS.find((p) => p.id === copy.defId)?.category === 'Booster') ids.add(copy.defId);
	return [...ids];
}
