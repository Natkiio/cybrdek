// =============================================================================
// dice.test.ts: automated tests for the dice engine (dice.ts)
// =============================================================================
//
// Run them with:  npm test          (once)
//                 npm run test:watch (re-runs every time you save)
//
// Every test has the same shape:
//   GIVEN some input  →  EXPECT an exact output  →  Vitest checks they match
//
// Dice are random, so we test them two ways:
//   1. PROPERTIES: things that are always true, e.g. "a d6 is always 1 to 6".
//      We roll many times and check every result.
//   2. LOADED DICE (mocking): we temporarily replace Math.random with a fake
//      that returns numbers we pick, so we know exactly what will be rolled.
//      Remember: Math.random 0.97 → a d10 rolls 10, and 0.01 → it rolls 1.
// =============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { roll, rollDice, rollDie, skillCheck, sumRolls } from './dice.ts';

// How many times to roll when checking properties
const MANY = 1000;

// Load the dice: make Math.random return these values, in order, one per die.
function loadDice(...randoms: number[]) {
	const spy = vi.spyOn(Math, 'random');
	for (const r of randoms) spy.mockReturnValueOnce(r);
	return spy;
}

// After every test, put the real (fair) Math.random back
afterEach(() => {
	vi.restoreAllMocks();
});

describe('rollDie', () => {
	it('always rolls a whole number from 1 to the number of sides', () => {
		for (const sides of [4, 6, 10, 20]) {
			for (let i = 0; i < MANY; i++) {
				const result = rollDie(sides);
				expect(Number.isInteger(result)).toBe(true);
				expect(result).toBeGreaterThanOrEqual(1);
				expect(result).toBeLessThanOrEqual(sides);
			}
		}
	});

	it('can roll the lowest and highest faces', () => {
		loadDice(0, 0.9999);
		expect(rollDie(10)).toBe(1);
		expect(rollDie(10)).toBe(10);
	});

	it('turns Math.random into the right face (0.97 → 10, 0.01 → 1, 0.48 on a d6 → 3)', () => {
		loadDice(0.97, 0.01, 0.48);
		expect(rollDie(10)).toBe(10);
		expect(rollDie(10)).toBe(1);
		expect(rollDie(6)).toBe(3);
	});
});

describe('rollDice', () => {
	it('rolls the number of dice asked for', () => {
		expect(rollDice(3, 6)).toHaveLength(3);
		expect(rollDice(1, 10)).toHaveLength(1);
	});

	it('rolls nothing when asked for 0 dice', () => {
		expect(rollDice(0, 6)).toEqual([]);
	});

	it('keeps every die in the order rolled', () => {
		loadDice(0.5, 0.0, 0.9);
		expect(rollDice(3, 6)).toEqual([4, 1, 6]);
	});

	it('only ever rolls legal faces', () => {
		for (const result of rollDice(MANY, 6)) {
			expect(result).toBeGreaterThanOrEqual(1);
			expect(result).toBeLessThanOrEqual(6);
		}
	});
});

describe('sumRolls', () => {
	it('adds up a list of dice', () => {
		expect(sumRolls([4, 5, 5])).toBe(14);
	});

	it('returns the die itself for a single die', () => {
		expect(sumRolls([7])).toBe(7);
	});

	it('returns 0 for an empty list (edge case)', () => {
		expect(sumRolls([])).toBe(0);
	});

	it('does not change the list it was given', () => {
		const rolls = [4, 5, 5];
		sumRolls(rolls);
		expect(rolls).toEqual([4, 5, 5]);
	});
});

describe('roll', () => {
	it('rolls the dice and adds the modifier (2d6+3 → [4, 5] = 12)', () => {
		loadDice(0.5, 0.7); // d6 faces: 4 and 5
		expect(roll(2, 6, 3)).toEqual({ rolls: [4, 5], modifier: 3, total: 12 });
	});

	it('works with no modifier', () => {
		loadDice(0.5, 0.7);
		expect(roll(2, 6, 0)).toEqual({ rolls: [4, 5], modifier: 0, total: 9 });
	});

	it('works with a negative modifier', () => {
		loadDice(0.5); // d20 face: 11
		expect(roll(1, 20, -2)).toEqual({ rolls: [11], modifier: -2, total: 9 });
	});
});

describe('skillCheck (Cyberpunk RED)', () => {
	it('normal roll: 1d10 + modifier, one die only', () => {
		const spy = loadDice(0.65); // rolls 7
		expect(skillCheck(14)).toEqual({ rolls: [7], modifier: 14, total: 21 });
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('critical success: a 10 rolls one more d10 and ADDS it', () => {
		loadDice(0.97, 0.55); // rolls 10, then 6
		expect(skillCheck(14)).toEqual({ rolls: [10, 6], modifier: 14, total: 30 });
	});

	it('critical failure: a 1 rolls one more d10 and SUBTRACTS it', () => {
		loadDice(0.01, 0.35); // rolls 1, then 4
		expect(skillCheck(14)).toEqual({ rolls: [1, 4], modifier: 14, total: 11 });
	});

	it('a crit only explodes once, even if the extra die is also a 10', () => {
		const spy = loadDice(0.97, 0.97); // rolls 10, then 10
		expect(skillCheck(0)).toEqual({ rolls: [10, 10], modifier: 0, total: 20 });
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('2 and 9 are normal rolls, not crits', () => {
		loadDice(0.15, 0.85); // rolls 2, then 9
		expect(skillCheck(5).rolls).toEqual([2]);
		expect(skillCheck(5).rolls).toEqual([9]);
	});
});
