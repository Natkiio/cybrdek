import { describe, expect, it } from 'vitest';
import { damageThroughArmor, currentSp, wornSp } from './armor.ts';
import { takeArmoredDamage } from './wounds.ts';
import { headMultiplierOf, type AttackType } from './attacks.ts';
import type { GearItem } from './gear.ts';

const armor = (sp = 11, location: 'body' | 'head' | 'both' = 'body', id = 'armor'): GearItem =>
	({ id, kind: 'armor', name: 'Test armor', sp, location });

describe('special damage versus armor (Core pp. 176–178, 345–346, 349)', () => {
	it('preserves normal ranged defaults for existing sheet and tracker calls', () => {
		const gear = [armor()];
		expect(takeArmoredDamage(40, 40, gear, 14, 'body')).toEqual(takeArmoredDamage(40, 40, gear, 14, 'body', { attackType: 'ranged' }));
		expect(takeArmoredDamage(40, 40, gear, 14, 'body').hp).toBe(37);
	});
	it.each(['melee', 'martial-arts'] as const)('%s uses half the current SP, rounded up, then ablates real SP by 1', (attackType) => {
		const gear = [armor()];
		const result = takeArmoredDamage(40, 40, gear, 7, 'body', { attackType });
		expect(result.sp).toBe(6);
		expect(result.hp).toBe(39);
		expect(currentSp(result.gear[0], 'body')).toBe(10);
		expect(gear[0].currentSp).toBeUndefined();
		const next = takeArmoredDamage(result.hp, 40, result.gear, 6, 'body', { attackType });
		expect(next.sp).toBe(5);
		expect(next.hp).toBe(38);
	});
	it('uses full SP for Brawling, including cyberarm brawling', () => {
		const gear = [armor()];
		expect(takeArmoredDamage(40, 40, gear, 7, 'body', { attackType: 'brawling' }).hp).toBe(40);
		expect(takeArmoredDamage(40, 40, gear, 12, 'body', { attackType: 'brawling' }).hp).toBe(39);
	});
	it.each(['melee', 'armor-piercing'] as const)('a %s hit equal to effective SP neither penetrates nor ablates', (attackType) => {
		const gear = [armor()];
		const result = damageThroughArmor(gear, attackType === 'melee' ? 6 : 11, 'body', { attackType });
		expect(result.penetrating).toBe(0);
		expect(result.gear).toBe(gear);
	});
	it('AP uses full SP and ablates every worn layer at the hit location by 2, minimum 0', () => {
		const gear = [armor(11, 'both'), armor(1, 'body', 'low'), { ...armor(18, 'body', 'carried'), equipped: false }];
		const result = takeArmoredDamage(40, 40, gear, 14, 'body', { attackType: 'armor-piercing' });
		expect(result.hp).toBe(37);
		expect(result.gear.map((g) => currentSp(g, 'body'))).toEqual([9, 0, 18]);
		expect(wornSp(result.gear)).toEqual({ body: 9, head: 11 });
	});
	it('subtracts halved SP before head multiplication, including Cracked Skull', () => {
		const gear = [armor(11, 'head')];
		expect(takeArmoredDamage(40, 40, gear, 10, 'head', { attackType: 'melee' }).hp).toBe(32);
		expect(takeArmoredDamage(40, 40, gear, 10, 'head', { attackType: 'melee', headMultiplier: 3 }).hp).toBe(28);
	});
	it.each(['direct', 'choke', 'throw'] as const)('%s bypasses all SP, ablation and head multipliers', (attackType) => {
		const gear = [armor(18, 'both')];
		const result = takeArmoredDamage(40, 40, gear, 6, 'head', { attackType, headMultiplier: 3 });
		expect(result.hp).toBe(34);
		expect(result.gear).toBe(gear);
	});
	it.each(['rubber', 'stun-gun', 'stun-baton'] as const)('%s never ablates on penetration', (attackType) => {
		const gear = [armor(7, 'both')];
		const result = takeArmoredDamage(40, 40, gear, 10, 'body', { attackType });
		expect(result.gear).toBe(gear);
		expect(result.hp).toBe(attackType === 'stun-baton' ? 34 : 37);
	});
	it.each(['rubber', 'choke'] as const)('%s follows the book’s above-1 / below-0 exception precisely', (attackType) => {
		expect(takeArmoredDamage(5, 40, [], 6, 'body', { attackType }).hp).toBe(1);
		expect(takeArmoredDamage(5, 40, [], 5, 'body', { attackType }).hp).toBe(0);
		expect(takeArmoredDamage(1, 40, [], 2, 'body', { attackType }).hp).toBe(0);
		expect(takeArmoredDamage(5, 40, [], 6, 'body', { attackType }).unconscious).toBe(attackType === 'choke');
	});
	it.each(['stun-gun', 'stun-baton'] as const)('%s stops at 1 HP and signals unconsciousness without healing a zero-HP target', (attackType) => {
		for (const hp of [1, 5]) {
			const result = takeArmoredDamage(hp, 40, [], hp, 'body', { attackType });
			expect(result.hp).toBe(1);
			expect(result.unconscious).toBe(true);
		}
		expect(takeArmoredDamage(0, 40, [], 5, 'body', { attackType }).hp).toBe(0);
	});
	it.each([NaN, Infinity, -5])('invalid damage %s does not damage HP or armor', (amount) => {
		const gear = [armor()];
		for (const attackType of ['ranged', 'melee', 'armor-piercing', 'direct'] as AttackType[]) {
			const result = takeArmoredDamage(40, 40, gear, amount, 'body', { attackType });
			expect(result.hp).toBe(40);
			expect(result.gear).toBe(gear);
		}
	});
});


it('reads Cracked Skull from optional character extra without rejecting legacy or malformed data', () => {
	expect(headMultiplierOf({})).toBe(2);
	expect(headMultiplierOf({ criticalInjuries: [null, { location: 'body', roll: 9 }] })).toBe(2);
	expect(headMultiplierOf({ criticalInjuries: [{ location: 'head', roll: 9 }] })).toBe(3);
});
