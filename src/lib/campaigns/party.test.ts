import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/supabase/client.ts', () => ({ supabase: () => ({}) }));
const { summarise } = await import('./party.ts');

const sheet = (extra: Record<string, unknown> = {}) => ({
	id: 'v',
	name: 'Vex',
	rulesetId: 'cyberpunk-red',
	stats: { INT: 6, REF: 7, DEX: 6, TECH: 5, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 5 },
	skills: {},
	extra: { role: 'solo', roleRank: 5, ...extra }
});

describe('summarise', () => {
	it('shows name, Role, rank, HP and IP', () => {
		expect(summarise('k', sheet({ currentHp: 12, ip: 40 }))).toMatchObject({
			key: 'k',
			name: 'Vex',
			role: 'Solo',
			rank: 5,
			hp: 12,
			ip: 40
		});
	});

	it('treats a character with no damage recorded as unhurt', () => {
		const member = summarise('k', sheet())!;
		expect(member.hp).toBe(member.maxHp);
		expect(member.maxHp).toBeGreaterThan(0);
	});

	it('gives the GM dashboard wound state, worn SP, STATs, Humanity and injuries', () => {
		const member = summarise(
			'k',
			sheet({
				currentHp: 10, // max is 40 with BODY 6 / WILL 6, so under half: Seriously Wounded
				gear: [
					{ id: 'a', kind: 'armor', name: 'Kevlar', sp: 7, location: 'both', currentSp: { body: 5 } },
					{ id: 'b', kind: 'armor', name: 'Helmet', sp: 11, location: 'head', equipped: false }
				],
				criticalInjuries: [{ location: 'body', roll: 5 }],
				humanity: 42
			})
		)!;
		expect(member.wound).toBe('seriously');
		expect(member.woundLabel).toBe('Seriously Wounded');
		expect(member.sp).toEqual({ head: 7, body: 5 }); // the unworn helmet doesn't count
		expect(member.stats.REF).toBe(7);
		expect(member.humanity).toBe(42);
		expect(member.maxHumanity).toBe(50);
		expect(member.injuries).toEqual(['Broken Ribs']);
		expect(member.character.name).toBe('Vex');
	});

	it('an unhurt character with nothing worn shows zero SP and no injuries', () => {
		const member = summarise('k', sheet())!;
		expect(member).toMatchObject({ wound: 'unhurt', sp: { head: 0, body: 0 }, injuries: [] });
	});

	it('skips a damaged character instead of showing nonsense', () => {
		expect(summarise('k', { nonsense: true })).toBeUndefined();
		expect(summarise('k', null)).toBeUndefined();
	});
});
