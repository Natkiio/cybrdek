import { describe, expect, it } from 'vitest';
import { actionPenalty, clampHp, resolveDeathSave, woundedMove, woundState } from './wounds.ts';

describe('woundState (40 max HP, Seriously Wounded threshold 20)', () => {
	it.each([
		[40, 'unhurt'],
		[39, 'lightly'],
		[20, 'lightly'], // exactly half is not "less than half"
		[19, 'seriously'],
		[1, 'seriously'],
		[0, 'mortally']
	] as const)('%i HP is %s', (hp, state) => {
		expect(woundState(hp, 40)).toBe(state);
	});

	it('rounds the half-HP threshold up for odd max HP (35 → 18)', () => {
		expect(woundState(18, 35)).toBe('lightly');
		expect(woundState(17, 35)).toBe('seriously');
	});
});

describe('penalties', () => {
	it('gives −2 Seriously, −4 Mortally, nothing otherwise', () => {
		expect(actionPenalty('unhurt')).toBe(0);
		expect(actionPenalty('lightly')).toBe(0);
		expect(actionPenalty('seriously')).toBe(-2);
		expect(actionPenalty('mortally')).toBe(-4);
	});

	it('cuts MOVE by 6 when Mortally Wounded, minimum 1', () => {
		expect(woundedMove(8, 'mortally')).toBe(2);
		expect(woundedMove(4, 'mortally')).toBe(1);
		expect(woundedMove(4, 'seriously')).toBe(4);
	});
});

describe('clampHp', () => {
	it('keeps HP between 0 and max', () => {
		expect(clampHp(-7, 40)).toBe(0);
		expect(clampHp(55, 40)).toBe(40);
		expect(clampHp(12, 40)).toBe(12);
	});
});

describe('resolveDeathSave', () => {
	it('survives when die + penalty is under BODY', () => {
		expect(resolveDeathSave(5, 0, 6).survived).toBe(true);
		expect(resolveDeathSave(5, 1, 6).survived).toBe(false); // 6 is not under 6
	});

	it('always fails on a natural 10', () => {
		expect(resolveDeathSave(10, -20, 8).survived).toBe(false);
	});
});
