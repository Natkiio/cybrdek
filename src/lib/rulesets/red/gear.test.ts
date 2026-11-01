import { describe, expect, it } from 'vitest';
import {
	ARMOR_TYPES,
	armorFromType,
	gearOf,
	isDamageCrit,
	parseDamage,
	validateGear,
	WEAPON_TYPES,
	weaponFromType,
	wornSp
} from './gear.ts';
import { skills } from './skills.ts';

const type = (id: string) => WEAPON_TYPES.find((w) => w.id === id)!;

describe('weapon presets', () => {
	it('use real skill ids', () => {
		const ids = new Set(skills.map((s) => s.id));
		for (const w of WEAPON_TYPES) expect(ids.has(w.skill), w.id).toBe(true);
	});

	it('fill in a Heavy Pistol with a full magazine', () => {
		expect(weaponFromType(type('heavy-pistol'), 'w1', 'Militech Avenger')).toEqual({
			id: 'w1',
			kind: 'weapon',
			name: 'Militech Avenger',
			weaponType: 'heavy-pistol',
			skill: 'handgun',
			damage: '3d6',
			rof: 2,
			magazine: 8,
			ammo: 8
		});
	});

	it('give melee weapons no magazine', () => {
		expect(weaponFromType(type('heavy-melee'), 'w2').magazine).toBeUndefined();
	});
});

describe('parseDamage', () => {
	it('reads NdM dice', () => {
		expect(parseDamage('3d6')).toEqual({ count: 3, sides: 6 });
		expect(parseDamage(' 5D6 ')).toEqual({ count: 5, sides: 6 });
		expect(parseDamage('d10')).toEqual({ count: 1, sides: 10 });
	});

	it('rejects anything else', () => {
		for (const bad of ['', '3d', 'd1', '0d6', '3d6+2', 'six']) expect(parseDamage(bad), bad).toBeNull();
	});
});

describe('isDamageCrit', () => {
	it('needs two or more 6s', () => {
		expect(isDamageCrit([6, 6, 1])).toBe(true);
		expect(isDamageCrit([6, 5, 4])).toBe(false);
	});
});

describe('validateGear', () => {
	it('accepts presets', () => {
		expect(validateGear(weaponFromType(type('smg'), 'a'))).toEqual([]);
		expect(validateGear(armorFromType(ARMOR_TYPES[0], 'b', 'body'))).toEqual([]);
	});

	it('flags bad weapons', () => {
		const bad = { ...weaponFromType(type('smg'), 'a'), name: ' ', damage: 'lots', rof: 0 };
		expect(validateGear(bad)).toHaveLength(3);
	});
});

describe('wornSp and gearOf', () => {
	it('takes the best SP per location', () => {
		const gear = [
			armorFromType(ARMOR_TYPES.find((a) => a.id === 'kevlar')!, '1', 'body'),
			armorFromType(ARMOR_TYPES.find((a) => a.id === 'light-armorjack')!, '2', 'body'),
			armorFromType(ARMOR_TYPES.find((a) => a.id === 'leathers')!, '3', 'head')
		];
		expect(wornSp(gear)).toEqual({ head: 4, body: 11 });
	});

	it('reads gear from extra safely', () => {
		expect(gearOf({})).toEqual([]);
		expect(gearOf({ gear: 'nope' })).toEqual([]);
	});
});
