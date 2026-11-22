import { BLACK_ICE, DEMONS } from '#lib/rulesets/red/net-security.ts';
export const ENTRY_TYPES = ['password', 'file', 'control-node', 'black-ice', 'demon'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];
export interface NetEntry {
	id: string;
	type: EntryType;
	name: string;
	dv: number | null;
	refId: string | null;
	playerText: string;
	gmNotes: string;
}
export interface NetFloor {
	id: string;
	label: string;
	revealed: boolean;
	gmNotes: string;
	entries: NetEntry[];
}
export interface Architecture {
	name: string;
	gmNotes: string;
	floors: NetFloor[];
}
export type PlayerEntry = Omit<NetEntry, 'gmNotes' | 'dv'>;
export interface PlayerFloor {
	id: string;
	label: string;
	entries: PlayerEntry[];
}
export interface PlayerArchitecture {
	name: string;
	floors: PlayerFloor[];
}
export interface SavedArchitecture extends Architecture {
	id: string;
	revision: number;
}
export type ArchitectureView =
	| { canManage: true; architectures: SavedArchitecture[] }
	| { canManage: false; architectures: (PlayerArchitecture & { id: string; revision: number })[] };
export const newArchitecture = (): Architecture => ({
	name: 'New Architecture',
	gmNotes: '',
	floors: []
});
export const newFloor = (id: string, label: string): NetFloor => ({
	id,
	label,
	revealed: false,
	gmNotes: '',
	entries: []
});
export const newEntry = (id: string, type: EntryType): NetEntry => ({
	id,
	type,
	name:
		type === 'black-ice'
			? BLACK_ICE[0].name
			: type === 'demon'
				? DEMONS[0].name
				: type === 'control-node'
					? 'Control node'
					: type === 'password'
						? 'Password'
						: 'File',
	refId: type === 'black-ice' ? BLACK_ICE[0].id : type === 'demon' ? DEMONS[0].id : null,
	dv: null,
	playerText: '',
	gmNotes: ''
});
const text = (s: unknown, max: number, min = 0) =>
	typeof s === 'string' && s.trim().length >= min && s.length <= max;
/** Editing limits are app safeguards, not Architecture construction rules. */
export function architectureProblem(a: Architecture): string | null {
	if (
		!text(a.name, 100, 1) ||
		!text(a.gmNotes, 4000) ||
		!Array.isArray(a.floors) ||
		a.floors.length > 100
	)
		return 'Use a name and no more than 100 floors; keep notes within 4000 characters.';
	const ids = new Set<string>();
	for (const f of a.floors) {
		if (
			!text(f.id, 100, 1) ||
			ids.has(f.id) ||
			!text(f.label, 100, 1) ||
			!text(f.gmNotes, 4000) ||
			typeof f.revealed !== 'boolean' ||
			!Array.isArray(f.entries) ||
			f.entries.length > 20
		)
			return 'Check floor labels, IDs and notes; each floor can hold up to 20 entries.';
		ids.add(f.id);
		for (const e of f.entries) {
			if (
				!text(e.id, 100, 1) ||
				ids.has(e.id) ||
				!ENTRY_TYPES.includes(e.type) ||
				!text(e.name, 100, 1) ||
				!text(e.playerText, 2000) ||
				!text(e.gmNotes, 4000)
			)
				return 'Check entry names, IDs and text lengths.';
			ids.add(e.id);
			if (e.dv !== null && (!Number.isInteger(e.dv) || e.dv < 0 || e.dv > 99))
				return 'DV must be empty or a whole number from 0 to 99.';
			const catalog = e.type === 'black-ice' ? BLACK_ICE : e.type === 'demon' ? DEMONS : null;
			if (catalog ? !catalog.some((d) => d.id === e.refId) || e.dv !== null : e.refId !== null)
				return 'Choose a valid security reference; ICE and demons do not use a DV.';
		}
	}
	return null;
}
