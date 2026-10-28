import type { StatDef } from '#lib/engine/types.ts';

// The 10 STATs. At character creation no STAT may be lower than 2 or higher than 8.
export const stats: StatDef[] = [
	{ id: 'INT', name: 'Intelligence', min: 2, max: 8 },
	{ id: 'REF', name: 'Reflexes', min: 2, max: 8 },
	{ id: 'DEX', name: 'Dexterity', min: 2, max: 8 },
	{ id: 'TECH', name: 'Technique', min: 2, max: 8 },
	{ id: 'COOL', name: 'Cool', min: 2, max: 8 },
	{ id: 'WILL', name: 'Willpower', min: 2, max: 8 },
	{ id: 'LUCK', name: 'Luck', min: 2, max: 8 },
	{ id: 'MOVE', name: 'Movement', min: 2, max: 8 },
	{ id: 'BODY', name: 'Body', min: 2, max: 8 },
	{ id: 'EMP', name: 'Empathy', min: 2, max: 8 }
];
