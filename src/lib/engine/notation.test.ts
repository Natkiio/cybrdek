import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDice, rollExpression } from './notation.ts';

afterEach(() => vi.restoreAllMocks());

describe('parseDice', () => {
	it('parses dice, flat bonuses, whitespace, uppercase D, and multiple groups', () => {
		expect(parseDice('d10')).toEqual({ ok: true, terms: [{ count: 1, sides: 10, sign: 1 }], modifier: 0 });
		expect(parseDice('3D6 + 2')).toEqual({ ok: true, terms: [{ count: 3, sides: 6, sign: 1 }], modifier: 2 });
		expect(parseDice('4d6 + 1d4 + 3')).toEqual({
			ok: true,
			terms: [{ count: 4, sides: 6, sign: 1 }, { count: 1, sides: 4, sign: 1 }],
			modifier: 3
		});
	});

	it('keeps negative dice groups and flat modifiers', () => {
		expect(parseDice('2d6-1d4-1')).toEqual({
			ok: true,
			terms: [{ count: 2, sides: 6, sign: 1 }, { count: 1, sides: 4, sign: -1 }],
			modifier: -1
		});
	});

	it('reports malformed expressions clearly', () => {
		for (const [input, error] of [
			['', 'Enter a dice expression.'],
			['d', "Expected a number after 'd'."],
			['2d6+', "Expected a term after '+'."],
			['2d6x', "Expected '+' or '-' at position 4."],
			['hello', "Expected a number or 'd' at position 1."],
			['4', 'Enter at least one dice group.']
		]) {
			expect(parseDice(input)).toEqual({ ok: false, error });
		}
	});

	it('enforces group, side, and total dice limits', () => {
		expect(parseDice('0d6')).toEqual({ ok: false, error: 'Dice count must be from 1 to 100.' });
		expect(parseDice('101d6')).toEqual({ ok: false, error: 'Dice count must be from 1 to 100.' });
		expect(parseDice('1d1')).toEqual({ ok: false, error: 'Dice sides must be from 2 to 1000.' });
		expect(parseDice('1d1001')).toEqual({ ok: false, error: 'Dice sides must be from 2 to 1000.' });
		expect(parseDice('100d6+100d6+1d6')).toEqual({ ok: false, error: 'Too many dice (max 200).' });
	});
});

describe('rollExpression', () => {
	it('normalises and rolls a multi-group expression', () => {
		vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValueOnce(0.5);
		expect(rollExpression('2d6 + 1d4 + 3')).toEqual({
			ok: true,
			expression: '2d6+1d4+3',
			result: { rolls: [1, 6, 3], modifier: 3, total: 13 },
			groups: [{ notation: '2d6', rolls: [1, 6] }, { notation: '+1d4', rolls: [3] }]
		});
	});

	it('subtracts a negative dice group while preserving its dice', () => {
		vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0.75);
		const result = rollExpression('2d6-1d4-1');

		expect(result).toEqual({
			ok: true,
			expression: '2d6-1d4-1',
			result: { rolls: [4, 4, 4], modifier: -1, total: 3 },
			groups: [{ notation: '2d6', rolls: [4, 4] }, { notation: '-1d4', rolls: [4] }]
		});
	});

	it('returns parser errors without rolling', () => {
		expect(rollExpression('2d')).toEqual({ ok: false, error: "Expected a number after 'd'." });
	});
});
