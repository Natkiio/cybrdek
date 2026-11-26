// Being in the NET (#100, part 4): whether a Netrunner is jacked in, where they
// are in the Architecture and which Boosters they're running. Kept on the
// character so it survives a reload and works offline. Core pp. 196–198.
import type { GearItem } from './gear.ts';
import type { InstalledCyberware } from './cyberware.ts';
import type { Cyberdeck } from './cyberdeck.ts';
import { HARDWARE } from './programs.ts';

export interface NetRun {
	jackedIn: boolean;
	/** The campaign Architecture, if the runner picked one the GM revealed. */
	architectureId: string | null;
	/** Its name, kept so the sheet still shows it offline. */
	architectureName: string;
	/** Without an Architecture: the floor number, 1 being the top, where you jack in. */
	floor: number;
	/** With one: the revealed floor you're on, and its label for offline. */
	floorId: string | null;
	floorLabel: string;
	/** Booster program ids marked as running. */
	running: string[];
	/** NET Actions used this Turn (Core p. 197). */
	spent: number;
}

export const NOT_JACKED_IN: NetRun = Object.freeze({
	jackedIn: false,
	architectureId: null,
	architectureName: '',
	floor: 1,
	floorId: null,
	floorLabel: '',
	running: [],
	spent: 0
}) as NetRun;

/** Read the saved run from a character's extra fields, tolerating old or odd data. */
export function netRunOf(extra: Record<string, unknown>): NetRun {
	const raw = extra.netRun;
	if (!raw || typeof raw !== 'object') return { ...NOT_JACKED_IN, running: [] };
	const r = raw as Record<string, unknown>;
	const floor = Number(r.floor);
	return {
		jackedIn: r.jackedIn === true,
		architectureId: typeof r.architectureId === 'string' ? r.architectureId : null,
		architectureName: typeof r.architectureName === 'string' ? r.architectureName : '',
		floor: Number.isInteger(floor) && floor >= 1 ? floor : 1,
		floorId: typeof r.floorId === 'string' ? r.floorId : null,
		floorLabel: typeof r.floorLabel === 'string' ? r.floorLabel : '',
		running: Array.isArray(r.running) ? [...new Set(r.running.filter((id): id is string => typeof id === 'string'))] : [],
		spent: Number.isInteger(r.spent) && (r.spent as number) >= 0 ? (r.spent as number) : 0
	};
}

const TOP = { floor: 1, floorId: null, floorLabel: '' } as const;

/** Jacking in starts at the top floor, and is itself a NET Action (Core p. 198). */
export const jackIn = (run: NetRun): NetRun => ({ ...run, ...TOP, jackedIn: true, spent: run.spent + 1 });

/**
 * Jacking out, safe or not, resets the Architecture: a new run starts from
 * the top. Your Programs leave with you, so nothing is still running (Core p. 198).
 */
export const jackOut = (run: NetRun, safe = false): NetRun => ({
	...run,
	...TOP,
	jackedIn: false,
	running: [],
	// A safe Jack Out is a NET Action; an unsafe one isn't, but neither gives
	// the Turn's actions back. Only a new Turn does (Core p. 198).
	spent: run.spent + (safe ? 1 : 0)
});

/** Move to a floor by number, never above the top. */
export const moveTo = (run: NetRun, floor: number): NetRun => ({
	...run,
	floor: Math.max(1, Math.trunc(floor) || 1),
	floorId: null,
	floorLabel: ''
});

/** Move to a revealed floor of the chosen Architecture. */
export const moveToFloor = (run: NetRun, floor: { id: string; label: string }): NetRun => ({
	...run,
	floorId: floor.id,
	floorLabel: floor.label
});

/** Pick an Architecture to run (or none), starting again from the top. */
export const chooseArchitecture = (run: NetRun, a: { id: string; name: string } | null): NetRun => ({
	...run,
	...TOP,
	architectureId: a?.id ?? null,
	architectureName: a?.name ?? ''
});

/** Where the runner is, in words. */
export const positionOf = (run: NetRun): string =>
	run.floorId ? run.floorLabel : `Floor ${run.floor}`;

/** Virtuality Goggles, or Virtuality cybereyes, let you see Meatspace while you run (Core p. 197). */
export function seesMeatspace(gear: readonly GearItem[], cyberware: readonly InstalledCyberware[]): boolean {
	return gear.some((g) => /virtuality/i.test(g.name)) || cyberware.some((c) => c.defId === 'virtuality');
}

const BASE_RANGE = 6; // m/yds from an access point (Core p. 198)
const UPGRADED_RANGE = HARDWARE.find((h) => h.id === 'range-upgrade')!.numbers['Access-point range (m)']; // Core p. 208

/**
 * How far from the access point you can be. A Range Upgrade stretches it
 * (Core p. 208); with several decks and only some upgraded, say both, since
 * the sheet doesn't know which deck is in use.
 */
export function accessRange(decks: readonly Cyberdeck[]): string {
	const upgraded = decks.filter((d) => d.hardware.some((h) => h.defId === 'range-upgrade')).length;
	if (upgraded && upgraded === decks.length) return `${UPGRADED_RANGE} m/yds`;
	if (upgraded) return `${BASE_RANGE} m/yds (${UPGRADED_RANGE} with your Range Upgrade deck)`;
	return `${BASE_RANGE} m/yds`;
}

/** Only Boosters still loaded can be running, whatever was saved. */
export const stillRunning = (running: readonly string[], loaded: readonly string[]): string[] =>
	running.filter((id) => loaded.includes(id));

/** What to keep in mind in Meatspace while jacked in. Our own short wording. */
export function meatspaceRisks(seesMeat: boolean, range = `${BASE_RANGE} m/yds`): string[] {
	return [
		...(seesMeat ? [] : ['No Virtuality: you count as Unconscious in Meatspace until you Jack Out (Core p. 197).']),
		`Stay within ${range} of the access point, with no wall in between (Core pp. 198, 208).`,
		'Leaving that range jacks you out unsafely: every enemy Black ICE you met and didn’t Derez gets you first (Core p. 198).',
		'Each Turn: one Meat Action or your NET Actions, plus your Move Action (Core p. 197).'
	];
}

/** NET Actions still free this Turn, given the runner's Turn budget (see netActions). */
export const actionsLeft = (run: NetRun, perTurn: number): number => Math.max(0, perTurn - run.spent);

/** Use one NET Action, if jacked in. */
export const spendAction = (run: NetRun): NetRun => (run.jackedIn ? { ...run, spent: run.spent + 1 } : run);

/** A new Turn: every NET Action is back. */
export const newTurn = (run: NetRun): NetRun => ({ ...run, spent: 0 });
