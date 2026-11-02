import { describe, expect, it } from 'vitest';
import {
	awardIp,
	ipLogOf,
	ipOf,
	IP_LOG_LIMIT,
	logSpend,
	raiseRole,
	raiseSkill,
	roleRaiseCost,
	skillRaiseCost,
	undoLastSpend,
	type IpSpend
} from './improvement.ts';
import { skills } from './skills.ts';

const handgun = skills.find((s) => s.id === 'handgun')!;
const autofire = skills.find((s) => s.id === 'autofire')!;

describe('costs match the Core p. 411 tables', () => {
	it.each([
		[0, 20],
		[1, 40],
		[5, 120],
		[9, 200]
	])('typical skill at %i costs %i to raise', (level, cost) => {
		expect(skillRaiseCost(handgun, level)).toBe(cost);
	});

	it.each([
		[0, 40],
		[3, 160],
		[9, 400]
	])('(x2) skill at %i costs %i to raise', (level, cost) => {
		expect(autofire.costMultiplier).toBe(2);
		expect(skillRaiseCost(autofire, level)).toBe(cost);
	});

	it.each([
		[0, 60],
		[4, 300], // a new character's rank 4 → 5
		[9, 600]
	])('Role Ability at rank %i costs %i to raise', (rank, cost) => {
		expect(roleRaiseCost(rank)).toBe(cost);
	});

	it('has no cost past 10', () => {
		expect(skillRaiseCost(handgun, 10)).toBeNull();
		expect(roleRaiseCost(10)).toBeNull();
	});
});

describe('raiseSkill', () => {
	it('raises one level and deducts the cost', () => {
		const result = raiseSkill(handgun, 4, 150);
		expect(result).toEqual({
			ok: true,
			ip: 50,
			level: 5,
			spend: { kind: 'skill', target: 'handgun', from: 4, to: 5, cost: 100 }
		});
	});

	it('allows spending the exact balance', () => {
		const result = raiseSkill(handgun, 4, 100);
		expect(result.ok && result.ip).toBe(0);
	});

	it('refuses to overspend', () => {
		const result = raiseSkill(handgun, 4, 99);
		expect(result).toEqual({ ok: false, reason: 'Needs 100 IP; you have 99.' });
	});

	it('refuses to raise past 10', () => {
		expect(raiseSkill(handgun, 10, 9999).ok).toBe(false);
	});

	it('charges double for (x2) skills', () => {
		const result = raiseSkill(autofire, 2, 200);
		expect(result.ok && result.ip).toBe(80);
	});
});

describe('raiseRole', () => {
	it('raises one rank and deducts the cost', () => {
		const result = raiseRole(4, 300);
		expect(result).toEqual({
			ok: true,
			ip: 0,
			level: 5,
			spend: { kind: 'role', target: 'role', from: 4, to: 5, cost: 300 }
		});
	});

	it('refuses to overspend', () => {
		expect(raiseRole(4, 299).ok).toBe(false);
	});
});

describe('awardIp', () => {
	it('adds positive whole numbers', () => {
		expect(awardIp(10, 25)).toBe(35);
	});

	it.each([0, -5, 2.5, Number.NaN])('ignores %s', (amount) => {
		expect(awardIp(10, amount)).toBe(10);
	});
});

describe('reading from extra', () => {
	it('defaults to 0 IP and an empty log', () => {
		expect(ipOf({})).toBe(0);
		expect(ipLogOf({})).toEqual([]);
	});

	it('ignores bad IP values', () => {
		expect(ipOf({ ip: -3 })).toBe(0);
		expect(ipOf({ ip: '40' })).toBe(0);
		expect(ipOf({ ip: 40 })).toBe(40);
	});
});

describe('logSpend', () => {
	it(`keeps only the newest ${IP_LOG_LIMIT}`, () => {
		const spend = (to: number): IpSpend => ({ kind: 'skill', target: 'x', from: to - 1, to, cost: 1 });
		let log: IpSpend[] = [];
		for (let i = 1; i <= IP_LOG_LIMIT + 5; i++) log = logSpend(log, spend(i));
		expect(log).toHaveLength(IP_LOG_LIMIT);
		expect(log.at(-1)?.to).toBe(IP_LOG_LIMIT + 5);
		expect(log[0].to).toBe(6);
	});
});

describe('undoLastSpend', () => {
	const spend: IpSpend = { kind: 'skill', target: 'handgun', from: 4, to: 5, cost: 100 };

	it('refunds the cost and puts the level back', () => {
		expect(undoLastSpend([spend], 20, 5)).toEqual({
			ok: true,
			ip: 120,
			target: 'handgun',
			kind: 'skill',
			level: 4,
			log: []
		});
	});

	it('refuses with an empty log', () => {
		expect(undoLastSpend([], 20, 5).ok).toBe(false);
	});

	it('refuses if the level has changed since the spend', () => {
		expect(undoLastSpend([spend], 20, 6).ok).toBe(false);
	});
});
