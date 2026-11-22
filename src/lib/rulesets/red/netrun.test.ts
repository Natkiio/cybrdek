import { describe, expect, it } from 'vitest';
import {
	chooseArchitecture,
	jackIn,
	jackOut,
	meatspaceRisks,
	moveTo,
	moveToFloor,
	netRunOf,
	NOT_JACKED_IN,
	positionOf,
	seesMeatspace
} from './netrun.ts';
import type { GearItem } from './gear.ts';

describe('the saved run', () => {
	it('old characters are not jacked in', () => {
		expect(netRunOf({})).toEqual(NOT_JACKED_IN);
		expect(netRunOf({ netRun: 'nope' })).toEqual(NOT_JACKED_IN);
	});

	it('tidies odd data', () => {
		expect(netRunOf({ netRun: { jackedIn: 'yes', floor: -2, floorId: 4, running: ['worm', 'worm', 7, 'eraser'] } })).toEqual({
			...NOT_JACKED_IN,
			running: ['worm', 'eraser']
		});
	});
});

describe('jacking in and out (Core p. 198)', () => {
	const deep = { ...NOT_JACKED_IN, jackedIn: true, floor: 4, floorId: 'f4', floorLabel: 'Floor 4', running: ['worm'] };

	it('jacking in starts from the top', () => {
		expect(jackIn({ ...deep, jackedIn: false })).toMatchObject({ jackedIn: true, floor: 1, floorId: null, running: ['worm'] });
	});

	it('jacking out resets the Architecture and stops every Program', () => {
		expect(jackOut({ ...deep, architectureId: 'a', architectureName: 'Biotechnica' })).toEqual({
			...NOT_JACKED_IN,
			architectureId: 'a',
			architectureName: 'Biotechnica'
		});
	});

	it('moves by floor number, never above the top', () => {
		expect(moveTo(deep, 0)).toMatchObject({ floor: 1, floorId: null });
		expect(positionOf(moveTo(deep, 3))).toBe('Floor 3');
	});

	it('moves to a revealed floor, and choosing an Architecture starts at its top', () => {
		const on = moveToFloor(deep, { id: 'f2', label: 'Lobby' });
		expect(positionOf(on)).toBe('Lobby');
		expect(chooseArchitecture(on, { id: 'a', name: 'Arasaka' })).toMatchObject({
			architectureId: 'a',
			architectureName: 'Arasaka',
			floor: 1,
			floorId: null
		});
		expect(chooseArchitecture(on, null)).toMatchObject({ architectureId: null, architectureName: '' });
	});
});

describe('Meatspace (Core pp. 197–198)', () => {
	const goggles: GearItem = { id: 'g', kind: 'item', name: 'Virtuality Goggles' };

	it('Virtuality Goggles or Virtuality cybereyes let you see the room', () => {
		expect(seesMeatspace([], [])).toBe(false);
		expect(seesMeatspace([goggles], [])).toBe(true);
		expect(seesMeatspace([], [{ id: 'c', defId: 'virtuality', hl: 2 }])).toBe(true);
	});

	it('without them you count as Unconscious; the range warning is always there', () => {
		expect(meatspaceRisks(false)[0]).toMatch(/Unconscious/);
		expect(meatspaceRisks(true).some((r) => /Unconscious/.test(r))).toBe(false);
		expect(meatspaceRisks(true).some((r) => /6 m\/yds/.test(r))).toBe(true);
	});
});
