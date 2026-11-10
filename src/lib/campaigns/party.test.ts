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

	it('skips a damaged character instead of showing nonsense', () => {
		expect(summarise('k', { nonsense: true })).toBeUndefined();
		expect(summarise('k', null)).toBeUndefined();
	});
});
