// Checks the derived STATs against the Cyberpunk RED core rulebook (p. 79).

import { describe, expect, it } from 'vitest';
import { deathSave, derivedStats, hitPoints, humanity, seriouslyWoundedThreshold } from './derived.ts';

// The rulebook's Hit Points table: one row per WILL (2–10), one column per BODY (2–15).
const BODIES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const HP_TABLE: Record<number, number[]> = {
	2: [20, 25, 25, 30, 30, 35, 35, 40, 40, 45, 45, 50, 50, 55],
	3: [25, 25, 30, 30, 35, 35, 40, 40, 45, 45, 50, 50, 55, 55],
	4: [25, 30, 30, 35, 35, 40, 40, 45, 45, 50, 50, 55, 55, 60],
	5: [30, 30, 35, 35, 40, 40, 45, 45, 50, 50, 55, 55, 60, 60],
	6: [30, 35, 35, 40, 40, 45, 45, 50, 50, 55, 55, 60, 60, 65],
	7: [35, 35, 40, 40, 45, 45, 50, 50, 55, 55, 60, 60, 65, 65],
	8: [35, 40, 40, 45, 45, 50, 50, 55, 55, 60, 60, 65, 65, 70],
	9: [40, 40, 45, 45, 50, 50, 55, 55, 60, 60, 65, 65, 70, 70],
	10: [40, 45, 45, 50, 50, 55, 55, 60, 60, 65, 65, 70, 70, 75]
};

describe('hitPoints', () => {
	it('matches every cell of the rulebook HP table (126 combinations)', () => {
		for (const [will, row] of Object.entries(HP_TABLE)) {
			row.forEach((expected, i) => {
				expect(hitPoints(BODIES[i], Number(will)), `BODY ${BODIES[i]}, WILL ${will}`).toBe(expected);
			});
		}
	});

	it('rounds the average up (BODY 6 + WILL 5 = 5.5 → 6 → 40 HP)', () => {
		expect(hitPoints(6, 5)).toBe(40);
	});
});

describe('seriouslyWoundedThreshold', () => {
	it('is half of HP', () => {
		expect(seriouslyWoundedThreshold(40)).toBe(20);
	});

	it('rounds up on odd HP (35 → 18)', () => {
		expect(seriouslyWoundedThreshold(35)).toBe(18);
		expect(seriouslyWoundedThreshold(25)).toBe(13);
	});
});

describe('deathSave and humanity', () => {
	it('Death Save equals BODY', () => {
		expect(deathSave(7)).toBe(7);
	});

	it('Humanity is EMP × 10 (the book: 5 EMP → 50 Humanity)', () => {
		expect(humanity(5)).toBe(50);
		expect(humanity(2)).toBe(20);
		expect(humanity(10)).toBe(100);
	});
});

describe('derivedStats', () => {
	const base = { INT: 5, REF: 5, DEX: 5, TECH: 5, COOL: 5, LUCK: 5, MOVE: 5 };

	it('a Solo built for combat (BODY 8, WILL 6, EMP 4)', () => {
		expect(derivedStats({ ...base, BODY: 8, WILL: 6, EMP: 4 })).toEqual({
			hp: 45,
			seriouslyWounded: 23,
			deathSave: 8,
			humanity: 40
		});
	});

	it('a fragile Netrunner (BODY 3, WILL 4, EMP 6)', () => {
		expect(derivedStats({ ...base, BODY: 3, WILL: 4, EMP: 6 })).toEqual({
			hp: 30,
			seriouslyWounded: 15,
			deathSave: 3,
			humanity: 60
		});
	});

	it('a balanced Fixer (BODY 5, WILL 6, EMP 8)', () => {
		expect(derivedStats({ ...base, BODY: 5, WILL: 6, EMP: 8 })).toEqual({
			hp: 40,
			seriouslyWounded: 20,
			deathSave: 5,
			humanity: 80
		});
	});
});
