import { describe, expect, it } from 'vitest';
import {
	buildCharacter,
	defaultSkills,
	defaultStats,
	skillPointsSpent,
	statPointsSpent,
	validateCreation,
	validateSkills,
	validateStats
} from './creation.ts';
import { red } from './index.ts';
import type { GearItem } from './gear.ts';
import { slotsOf } from './cyberdeck.ts';
import { loadedBoosters } from './interface.ts';
import { seesMeatspace } from './netrun.ts';
import { defaultPicks } from './starter-kits.ts';

/** Default STATs (60 points) plus 2 more, so exactly 62 are spent. */
function validStats() {
	return { ...defaultStats(), REF: 8 };
}

describe('STATs', () => {
	it('defaults to 6 everywhere, 2 points short of 62', () => {
		expect(statPointsSpent(defaultStats())).toBe(60);
		expect(validateStats(defaultStats())).toEqual(['2 STAT points left to spend.']);
	});

	it('accepts exactly 62 points', () => {
		expect(validateStats(validStats())).toEqual([]);
	});

	it('rejects going over 62', () => {
		expect(validateStats({ ...validStats(), INT: 7 })).toContain('1 STAT points over the 62 limit.');
	});

	it('rejects a STAT above 8 or below 2', () => {
		expect(validateStats({ ...validStats(), BODY: 9, EMP: 5 })).toContain('BODY must be 2–8.');
		expect(validateStats({ ...validStats(), BODY: 1, EMP: 11 })).toContain('BODY must be 2–8.');
	});
});

describe('skills', () => {
	it('starts with the 13 Basic skills at 2 (26 points)', () => {
		expect(skillPointsSpent(defaultSkills())).toBe(26);
		expect(validateSkills(defaultSkills())).toEqual([]);
	});

	it('charges double for (x2) skills', () => {
		expect(skillPointsSpent({ ...defaultSkills(), autofire: 3 })).toBe(26 + 6);
	});

	it('rejects skills above 6 and Basic skills below 2', () => {
		const problems = validateSkills({ ...defaultSkills(), handgun: 7, stealth: 1 });
		expect(problems).toContain("Handgun can't be above 6.");
		expect(problems).toContain('Stealth is a Basic skill and must be at least 2.');
	});

	it('rejects spending more than 86 points', () => {
		// 26 already spent on Basics; +6 levels of five (x2) skills = 60 more → 86, then one more.
		const levels = {
			...defaultSkills(),
			autofire: 6,
			'heavy-weapons': 6,
			demolitions: 6,
			paramedic: 6,
			'martial-arts': 6
		};
		expect(validateSkills(levels)).toEqual([]);
		expect(validateSkills({ ...levels, handgun: 1 })).toContain('1 skill points over the 86 limit.');
	});
});

describe('buildCharacter', () => {
	const input = { handle: '  V  ', role: 'solo', stats: validStats(), skills: defaultSkills() };

	it('builds a Character with a rank 4 Role and only the skills taken', () => {
		const c = buildCharacter(input, red, 'abc');
		expect(c).toMatchObject({ id: 'abc', name: 'V', rulesetId: 'cyberpunk-red' });
		expect(c.extra).toEqual({ role: 'solo', roleRank: 4, method: 'complete-package' });
		expect(Object.keys(c.skills)).toHaveLength(13);
	});

	it('refuses to build an invalid character', () => {
		expect(validateCreation({ ...input, handle: '', role: 'nope' })).toHaveLength(2);
		expect(() => buildCharacter({ ...input, stats: defaultStats() }, red, 'x')).toThrow();
	});
});

describe('the Netrunner starter kit (Core p. 103)', () => {
	const input = { handle: 'Alt', role: 'netrunner', stats: validStats(), skills: defaultSkills() };
	const programs = (c: ReturnType<typeof buildCharacter>) =>
		(c.extra.gear as GearItem[]).find((g) => g.cyberdeck)!.cyberdeck!.programs.map((p) => [p.defId, p.loaded]);

	it('gives a loaded Standard deck and Virtuality Goggles', () => {
		const c = buildCharacter({ ...input, netrunnerKit: ['eraser', 'vrizzbolt', 'sword'] }, red, 'n');
		const gear = c.extra.gear as GearItem[];
		expect(gear.map((g) => g.name)).toEqual(['Cyberdeck', 'Virtuality Goggles']);
		expect(gear[0].cyberdeck!.quality).toBe('standard');
		expect(programs(c)).toEqual([['armor', true], ['sword', true], ['eraser', true], ['vrizzbolt', true], ['sword', true]]);
		expect(slotsOf(gear[0], gear, []).free).toBe(2); // 5 of 7 slots used
		expect(seesMeatspace(gear, [])).toBe(true);
		expect(loadedBoosters([gear[0].cyberdeck!])).toEqual(['eraser']);
	});

	it('is optional, only for Netrunners, and checks the picks', () => {
		expect(buildCharacter({ ...input, netrunnerKit: null }, red, 'n').extra.gear).toBeUndefined();
		expect(buildCharacter({ ...input, role: 'solo', netrunnerKit: defaultPicks() }, red, 's').extra.gear).toBeUndefined();
		expect(validateCreation({ ...input, netrunnerKit: ['worm', 'sword', 'worm'] })).toEqual(['Pick one program from each starter pair.']);
		expect(validateCreation({ ...input, netrunnerKit: ['see-ya'] })).toHaveLength(1);
	});
});
