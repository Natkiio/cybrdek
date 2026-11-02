import type { Character } from '#lib/engine/types.ts';
import { rulesets } from '#lib/rulesets/index.ts';

interface CharacterExport {
	format: 'cybrdek-character';
	version: 1;
	exportedAt: string;
	character: Character;
}

type ParseResult = { ok: true; character: Character } | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isWholeNumberInRange(value: unknown, min: number, max: number): boolean {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Serialise a character in the portable Cybrdek character-file format. */
export function exportCharacter(character: Character): string {
	const backup: CharacterExport = {
		format: 'cybrdek-character',
		version: 1,
		exportedAt: new Date().toISOString(),
		character
	};

	return JSON.stringify(backup, null, 2);
}

/** Makes a safe, readable filename such as `johnny-silverhand.cybrdek.json`. */
export function characterFileName(character: Character): string {
	const slug = character.name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return `${slug || 'character'}.cybrdek.json`;
}

/** Parse and validate a portable character file before it can reach IndexedDB. */
export function parseCharacterFile(text: string): ParseResult {
	let parsed: unknown;

	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, errors: ['This file is not valid JSON.'] };
	}

	if (!isPlainObject(parsed)) return { ok: false, errors: ['The backup file must contain an object.'] };

	const errors: string[] = [];
	if (parsed.format !== 'cybrdek-character') errors.push('This is not a Cybrdek character file.');
	if (parsed.version !== 1) errors.push('This character file uses an unsupported version.');
	if (!isPlainObject(parsed.character)) {
		errors.push('The character file is missing its character data.');
		return { ok: false, errors };
	}

	const candidate = parsed.character;
	if (typeof candidate.id !== 'string') errors.push('Character ID must be a string.');
	if (typeof candidate.name !== 'string' || candidate.name.trim() === '') {
		errors.push('Character name must be a non-empty string.');
	}
	if (typeof candidate.rulesetId !== 'string') errors.push('Character ruleset ID must be a string.');

	const ruleset = typeof candidate.rulesetId === 'string'
		? rulesets.find((item) => item.id === candidate.rulesetId)
		: undefined;
	if (typeof candidate.rulesetId === 'string' && !ruleset) {
		errors.push(`Unknown ruleset: ${candidate.rulesetId}.`);
	}

	if (!isPlainObject(candidate.stats)) {
		errors.push('Character stats must be an object.');
	} else if (ruleset) {
		const knownStats = new Set(ruleset.stats.map((stat) => stat.id));
		for (const stat of ruleset.stats) {
			if (!(stat.id in candidate.stats)) {
				errors.push(`Missing STAT ${stat.id}.`);
			} else if (!isWholeNumberInRange(candidate.stats[stat.id], 0, 20)) {
				errors.push(`STAT ${stat.id} must be a whole number from 0 to 20.`);
			}
		}
		for (const statId of Object.keys(candidate.stats)) {
			if (!knownStats.has(statId)) errors.push(`Unknown STAT: ${statId}.`);
		}
	}

	if (!isPlainObject(candidate.skills)) {
		errors.push('Character skills must be an object.');
	} else if (ruleset) {
		const knownSkills = new Set(ruleset.skills.map((skill) => skill.id));
		for (const [skillId, value] of Object.entries(candidate.skills)) {
			if (!knownSkills.has(skillId)) {
				errors.push(`Unknown skill: ${skillId}.`);
			} else if (!isWholeNumberInRange(value, 0, 10)) {
				errors.push(`Skill ${skillId} must be a whole number from 0 to 10.`);
			}
		}
	}

	const extra = candidate.extra;
	if (!isPlainObject(extra)) {
		errors.push('Character extra data must be an object.');
	} else if (ruleset && 'role' in extra && typeof extra.role !== 'string') {
		errors.push('Character role must be a known role ID.');
	} else if (
		ruleset &&
		typeof extra.role === 'string' &&
		!ruleset.roles.some((role) => role.id === extra.role)
	) {
		errors.push(`Unknown role: ${extra.role}.`);
	}
	if (isPlainObject(extra) && 'ip' in extra && !isWholeNumberInRange(extra.ip, 0, Number.MAX_SAFE_INTEGER)) {
		errors.push('Improvement Points must be a whole number of 0 or more.');
	}

	if (errors.length > 0) return { ok: false, errors };

	return {
		ok: true,
		character: {
			id: candidate.id as string,
			name: candidate.name as string,
			rulesetId: candidate.rulesetId as string,
			stats: candidate.stats as Record<string, number>,
			skills: candidate.skills as Record<string, number>,
			extra: candidate.extra as Record<string, unknown>
		}
	};
}
