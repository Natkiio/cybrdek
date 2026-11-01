import { describe, expect, it } from 'vitest';
import {
	capRolls,
	clearRollsFromEntries,
	filterRolls,
	isCriticalRoll,
	isFumbleRoll,
	type RollLike
} from './logic.ts';

function roll(overrides: Partial<RollLike> = {}): RollLike {
	return {
		kind: 'skill',
		result: { rolls: [5], modifier: 8, total: 13 },
		...overrides
	};
}

describe('roll log logic', () => {
	it('keeps rolls newest first while capping each character independently', () => {
		const aRolls = Array.from({ length: 21 }, (_, i) => roll({ characterId: 'a', result: { rolls: [i], modifier: 0, total: i } }));
		const entries = capRolls([aRolls[0], roll({ characterId: 'b' }), ...aRolls.slice(1)]);

		expect(entries.filter((entry) => entry.characterId === 'a')).toHaveLength(20);
		expect(entries.filter((entry) => entry.characterId === 'a').map((entry) => entry.result.rolls[0])).toEqual(
			Array.from({ length: 20 }, (_, i) => i)
		);
		expect(entries.find((entry) => entry.characterId === 'b')).toBeDefined();
	});

	it('supports filtering a character log and clearing its entries', () => {
		const entries = [roll({ characterId: 'a' }), roll({ characterId: 'b' }), roll()];
		const forA = filterRolls(entries, 'a');
		const afterClearA = clearRollsFromEntries(entries, 'a');

		expect(forA).toHaveLength(1);
		expect(afterClearA.map((entry) => entry.characterId)).toEqual(['b', undefined]);
		expect(clearRollsFromEntries(entries)).toEqual([]);
	});

	it('identifies crits and fumbles only for skill and stat checks', () => {
		expect(isCriticalRoll(roll({ result: { rolls: [10, 6], modifier: 0, total: 16 } }))).toBe(true);
		expect(isFumbleRoll(roll({ result: { rolls: [1, 4], modifier: 0, total: -3 } }))).toBe(true);
		expect(isCriticalRoll(roll({ kind: 'damage', result: { rolls: [10], modifier: 0, total: 10 } }))).toBe(false);
		expect(isFumbleRoll(roll({ kind: 'free', result: { rolls: [1], modifier: 0, total: 1 } }))).toBe(false);
	});
});
