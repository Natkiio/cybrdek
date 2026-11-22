// Being in the NET (#100, part 4): whether a Netrunner is jacked in, where they
// are in the Architecture and which Boosters they're running. Kept on the
// character so it survives a reload and works offline. Core pp. 196–198.
import type { GearItem } from './gear.ts';
import type { InstalledCyberware } from './cyberware.ts';

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
}

export const NOT_JACKED_IN: NetRun = Object.freeze({
	jackedIn: false,
	architectureId: null,
	architectureName: '',
	floor: 1,
	floorId: null,
	floorLabel: '',
	running: []
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
		running: Array.isArray(r.running) ? [...new Set(r.running.filter((id): id is string => typeof id === 'string'))] : []
	};
}

const TOP = { floor: 1, floorId: null, floorLabel: '' } as const;

/** Jacking in starts at the top floor (Core p. 198). */
export const jackIn = (run: NetRun): NetRun => ({ ...run, ...TOP, jackedIn: true });

/**
 * Jacking out, safe or not, resets the Architecture: a new run starts from
 * the top. Your Programs leave with you, so nothing is still running (Core p. 198).
 */
export const jackOut = (run: NetRun): NetRun => ({ ...run, ...TOP, jackedIn: false, running: [] });

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

/** What to keep in mind in Meatspace while jacked in. Our own short wording. */
export function meatspaceRisks(seesMeat: boolean): string[] {
	return [
		...(seesMeat ? [] : ['No Virtuality: you count as Unconscious in Meatspace until you Jack Out (Core p. 197).']),
		'Stay within 6 m/yds of the access point, with no wall in between (Core p. 198).',
		'Leaving that range jacks you out unsafely: every enemy Black ICE you met and didn’t Derez gets you first (Core p. 198).',
		'Each Turn: one Meat Action or your NET Actions, plus your Move Action (Core p. 197).'
	];
}
