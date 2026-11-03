import { describe, expect, it } from 'vitest';
import type { Character } from '#lib/engine/types.ts';
import { rulesets } from '#lib/rulesets/index.ts';
import { characterFileName, exportCharacter, parseCharacterFile } from './backup.ts';

const ruleset = rulesets[0];

function character(): Character {
	return {
		id: 'johnny-id',
		name: 'Johnny Silverhand',
		rulesetId: ruleset.id,
		stats: Object.fromEntries(ruleset.stats.map((stat) => [stat.id, 6])),
		skills: { handgun: 6, perception: 4 },
		extra: { role: 'rockerboy', currentHp: 35, gear: ['Malorian'] }
	};
}

function fileWith(change: (file: Record<string, unknown>) => void): string {
	const file = JSON.parse(exportCharacter(character())) as Record<string, unknown>;
	change(file);
	return JSON.stringify(file);
}

describe('character backups', () => {
	it('round-trips an exported character and keeps extra keys', () => {
		const original = character();
		const result = parseCharacterFile(exportCharacter(original));

		expect(result).toEqual({ ok: true, character: original });
	});

	it('makes a portable slug filename with a fallback', () => {
		expect(characterFileName(character())).toBe('johnny-silverhand.cybrdek.json');
		expect(characterFileName({ ...character(), name: '!!!' })).toBe('character.cybrdek.json');
	});

	it('rejects bad JSON and a wrong format', () => {
		expect(parseCharacterFile('{not json}')).toEqual({ ok: false, errors: ['This file is not valid JSON.'] });
		const result = parseCharacterFile(fileWith((file) => (file.format = 'other-app')));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContain('This is not a Cybrdek character file.');
	});

	it('rejects an unknown ruleset', () => {
		const result = parseCharacterFile(fileWith((file) => ((file.character as Record<string, unknown>).rulesetId = 'unknown')));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContain('Unknown ruleset: unknown.');
	});

	it('rejects missing and out-of-range stats', () => {
		const missing = parseCharacterFile(fileWith((file) => delete (file.character as Record<string, Record<string, unknown>>).stats.REF));
		const outOfRange = parseCharacterFile(fileWith((file) => ((file.character as Record<string, Record<string, unknown>>).stats.REF = 21)));

		expect(missing.ok).toBe(false);
		expect(outOfRange.ok).toBe(false);
		if (!missing.ok) expect(missing.errors).toContain('Missing STAT REF.');
		if (!outOfRange.ok) expect(outOfRange.errors).toContain('STAT REF must be a whole number from 0 to 20.');
	});

	it('rejects unknown skills and roles', () => {
		const skill = parseCharacterFile(fileWith((file) => ((file.character as Record<string, Record<string, unknown>>).skills.unknown = 2)));
		const role = parseCharacterFile(fileWith((file) => ((file.character as Record<string, Record<string, unknown>>).extra.role = 'legend')));

		expect(skill.ok).toBe(false);
		expect(role.ok).toBe(false);
		if (!skill.ok) expect(skill.errors).toContain('Unknown skill: unknown.');
		if (!role.ok) expect(role.errors).toContain('Unknown role: legend.');
	});

	it('keeps Improvement Points and their history', () => {
		const original = character();
		original.extra.ip = 40;
		original.extra.ipLog = [{ kind: 'skill', target: 'handgun', from: 5, to: 6, cost: 120 }];
		expect(parseCharacterFile(exportCharacter(original))).toEqual({ ok: true, character: original });
	});

	it.each([-5, 2.5, '40'])('rejects Improvement Points of %s', (ip) => {
		const result = parseCharacterFile(fileWith((file) => ((file.character as Record<string, Record<string, unknown>>).extra.ip = ip)));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContain('Improvement Points must be a whole number of 0 or more.');
	});

	it.each([
		['a string cost', { kind: 'skill', target: 'handgun', from: 4, to: 5, cost: '100' }],
		['a wrong cost', { kind: 'skill', target: 'handgun', from: 4, to: 5, cost: 1 }],
		['an unknown skill', { kind: 'skill', target: 'hacking', from: 4, to: 5, cost: 100 }],
		['a skipped level', { kind: 'skill', target: 'handgun', from: 4, to: 6, cost: 100 }],
		['a negative rank', { kind: 'role', target: 'role', from: -2, to: -1, cost: -60 }]
	])('rejects an IP history with %s', (_name, spend) => {
		const result = parseCharacterFile(fileWith((file) => ((file.character as Record<string, Record<string, unknown>>).extra.ipLog = [spend])));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContain('Improvement Point history is damaged.');
	});

	it.each([-2, 11, 4.5, '4'])('rejects a Role rank of %s', (rank) => {
		const result = parseCharacterFile(fileWith((file) => ((file.character as Record<string, Record<string, unknown>>).extra.roleRank = rank)));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContain('Role rank must be a whole number from 0 to 10.');
	});
});
