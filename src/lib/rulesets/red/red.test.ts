// Checks the Cyberpunk RED data against the core rulebook, so a typo or a
// missing skill is caught by CI instead of at the table.

import { describe, expect, it } from 'vitest';
import { red } from './index.ts';
import { rulesets } from '../index.ts';

const statIds = red.stats.map((s) => s.id);
const skillNames = (filter: (s: (typeof red.skills)[number]) => boolean) =>
	red.skills.filter(filter).map((s) => s.name).sort();

describe('Cyberpunk RED ruleset', () => {
	it('is registered with the app', () => {
		expect(rulesets).toContain(red);
	});

	it('has the 10 STATs in sheet order', () => {
		expect(statIds).toEqual(['INT', 'REF', 'DEX', 'TECH', 'COOL', 'WILL', 'LUCK', 'MOVE', 'BODY', 'EMP']);
	});

	it('limits every STAT to 2–8 at creation', () => {
		for (const stat of red.stats) {
			expect([stat.min, stat.max]).toEqual([2, 8]);
		}
	});

	it('has all 66 core skills, each with a unique id', () => {
		expect(red.skills).toHaveLength(66);
		expect(new Set(red.skills.map((s) => s.id)).size).toBe(66);
	});

	it('links every skill to a real STAT and a real category', () => {
		for (const skill of red.skills) {
			expect(statIds).toContain(skill.stat);
			expect(red.skillCategories).toContain(skill.category);
		}
	});

	it('has the right number of skills in each category', () => {
		const count = (c: string) => red.skills.filter((s) => s.category === c).length;
		expect(red.skillCategories.map((c) => [c, count(c)])).toEqual([
			['Awareness', 5],
			['Body', 6],
			['Control', 4],
			['Education', 16],
			['Fighting', 4],
			['Performance', 2],
			['Ranged Weapon', 5],
			['Social', 9],
			['Technique', 15]
		]);
	});

	it('marks exactly the 7 (x2) skills as double cost', () => {
		expect(skillNames((s) => s.costMultiplier === 2)).toEqual([
			'Autofire',
			'Demolitions',
			'Electronics/Security Tech',
			'Heavy Weapons',
			'Martial Arts',
			'Paramedic',
			'Pilot Air Vehicle'
		]);
	});

	it('marks exactly the 13 Basic skills', () => {
		expect(skillNames((s) => s.basic)).toEqual([
			'Athletics',
			'Brawling',
			'Concentration',
			'Conversation',
			'Education',
			'Evasion',
			'First Aid',
			'Human Perception',
			'Language',
			'Local Expert',
			'Perception',
			'Persuasion',
			'Stealth'
		]);
	});

	it('links key skills to the right STAT', () => {
		const statOf = (id: string) => red.skills.find((s) => s.id === id)?.stat;
		expect(statOf('handgun')).toBe('REF');
		expect(statOf('evasion')).toBe('DEX');
		expect(statOf('concentration')).toBe('WILL');
		expect(statOf('conversation')).toBe('EMP');
		expect(statOf('play-instrument')).toBe('TECH');
		expect(statOf('acting')).toBe('COOL');
	});

	it('has the 10 Roles with their Role Abilities', () => {
		expect(red.roles.map((r) => `${r.name}: ${r.ability}`)).toEqual([
			'Rockerboy: Charismatic Impact',
			'Solo: Combat Awareness',
			'Netrunner: Interface',
			'Tech: Maker',
			'Medtech: Medicine',
			'Media: Credibility',
			'Exec: Teamwork',
			'Lawman: Backup',
			'Fixer: Operator',
			'Nomad: Moto'
		]);
	});
});
