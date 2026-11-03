import { describe, expect, it } from 'vitest';
import { armoredStats, armorPenalty, currentSp, equipArmor, damageThroughArmor, wornSp } from './armor.ts';
import { ARMOR_TYPES, armorFromType, type ArmorLocation } from './gear.ts';
import { takeArmoredDamage, woundState } from './wounds.ts';

const armor = (id: string, location: ArmorLocation = 'body', key = id) =>
	armorFromType(ARMOR_TYPES.find((a) => a.id === id)!, key, location);

describe('RED armor (Core pp. 184–186, 350)', () => {
	it('has the eight verified SP/penalty values', () => {
		expect(ARMOR_TYPES.map((a) => [a.id, a.sp, a.penalty])).toEqual([
			['leathers', 4, 0], ['kevlar', 7, 0], ['light-armorjack', 11, 0],
			['bodyweight-suit', 11, 0], ['medium-armorjack', 12, -2],
			['heavy-armorjack', 13, -2], ['flak', 15, -4], ['metalgear', 18, -4]
		]);
	});

	it('absorbs lesser and equal hits without ablation', () => {
		const gear = [armor('light-armorjack')];
		for (const damage of [0, 5, 11]) {
			const result = takeArmoredDamage(40, 40, gear, damage, 'body');
			expect(result.hp).toBe(40);
			expect(result.gear).toEqual(gear);
		}
	});

	it('subtracts SP first, ablates every layer only in the struck location and preserves input', () => {
		const gear = [armor('light-armorjack'), armor('kevlar'), armor('flak', 'head')];
		const result = takeArmoredDamage(40, 40, gear, 14, 'body');
		expect(result.hp).toBe(37);
		expect(result.gear.map((g) => currentSp(g, g.location as ArmorLocation))).toEqual([10, 6, 15]);
		expect(gear[0].currentSp).toBeUndefined();
		expect(wornSp(result.gear)).toEqual({ head: 15, body: 10 });
	});

	it('doubles penetrating head damage, then ablates head only', () => {
		const gear = [armor('light-armorjack', 'head'), armor('kevlar')];
		const result = takeArmoredDamage(40, 40, gear, 14, 'head');
		expect(result.hpDamage).toBe(6);
		expect(result.hp).toBe(34);
		expect(wornSp(result.gear)).toEqual({ head: 10, body: 7 });
	});

	it('does not ablate carried armor, even if it has higher SP', () => {
		const gear = [armor('kevlar'), { ...armor('flak'), equipped: false }];
		const result = damageThroughArmor(gear, 10, 'body');
		expect(result.penetrating).toBe(3);
		expect(result.gear[0].currentSp?.body).toBe(6);
		expect(result.gear[1].currentSp).toBeUndefined();
	});

	it('tracks suit locations independently, including old named suits', () => {
		const suit = armor('bodyweight-suit');
		expect(suit.location).toBe('both');
		const result = damageThroughArmor([suit], 13, 'body');
		expect(wornSp(result.gear)).toEqual({ head: 11, body: 10 });
		expect(wornSp([{ ...suit, location: 'body', armorType: undefined }])).toEqual({ head: 11, body: 11 });
	});

	it('ignores carried armor and applies only the worst worn penalty, floored at zero', () => {
		const gear = [armor('medium-armorjack'), armor('flak', 'head'),
			{ ...armor('metalgear'), equipped: false }];
		expect(armorPenalty(gear)).toBe(-4);
		const stats = { REF: 8, DEX: 3, MOVE: 2, BODY: 6 };
		expect(armoredStats(stats, gear)).toEqual({ REF: 4, DEX: 0, MOVE: 0, BODY: 6 });
		expect(stats.REF).toBe(8);
		expect(wornSp(gear).body).toBe(12);
	});

	it('keeps SP nonnegative through repeated hits, keeps penalty, and reaches mortal wounds', () => {
		let gear = [{ ...armor('flak'), currentSp: { body: 1 } }];
		const first = takeArmoredDamage(2, 40, gear, 2, 'body');
		expect(first.hp).toBe(1);
		gear = first.gear as typeof gear;
		const second = takeArmoredDamage(first.hp, 40, gear, 4, 'body');
		expect(second.hp).toBe(0);
		expect(woundState(second.hp, 40)).toBe('mortally');
		expect(wornSp(second.gear).body).toBe(0);
		expect(armorPenalty(second.gear)).toBe(-4);
	});

	it('wears only one Bodyweight Suit and keeps the previous suit’s damage', () => {
		const first = { ...armor('bodyweight-suit', 'body', 'a'), currentSp: { body: 8 } };
		const gear = equipArmor([first, armor('bodyweight-suit', 'body', 'b')], 'b', true);
		expect(gear[0].equipped).toBe(false);
		expect(gear[0].currentSp?.body).toBe(8);
		expect(wornSp(gear)).toEqual({ head: 11, body: 11 });
	});

	it('damages an unarmored character normally', () => {
		expect(takeArmoredDamage(40, 40, [], 5, 'body').hp).toBe(35);
	});
});
