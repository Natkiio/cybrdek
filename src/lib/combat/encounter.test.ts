import { describe, expect, it } from 'vitest';
import { rulesets } from '#lib/rulesets/index.ts';
import type { Character } from '#lib/engine/types.ts';
import {
	addCombatants,
	damage,
	heal,
	makeNpc,
	makeNpcs,
	makePc,
	newEncounter,
	nextTurn,
	orderQueue,
	parseEncounter,
	previousTurn,
	removeCombatant,
	rollInitiative,
	setOut,
	spOf,
	startEncounter,
	type Combatant,
	type Encounter
} from './encounter.ts';

/** A die that gives these rolls in order. */
const dice = (...rolls: number[]): (() => number) => {
	const queue = [...rolls];
	return () => {
		const next = queue.shift();
		if (next === undefined) throw new Error('die ran out of rolls');
		return next;
	};
};

const npc = (name: string, ref = 5, hp = 30, sp = 0) =>
	makeNpc(name, { name, ref, hp, spHead: sp, spBody: sp });

const names = (e: Encounter) => e.combatants.map((c) => c.name);
const current = (e: Encounter) => e.combatants.find((c) => c.id === e.currentId)?.name;
const get = (e: Encounter, id: string) => e.combatants.find((c) => c.id === id) as Combatant;

function fight(...fighters: Combatant[]) {
	return startEncounter({ ...newEncounter(), combatants: fighters }, dice(...fighters.map(() => 1)));
}

describe('initiative (Core pp. 127, 168)', () => {
	it('is REF + 1d10', () => {
		expect(rollInitiative(npc('A', 7), dice(6))).toMatchObject({ roll: 6, initiative: 13 });
	});

	it('runs highest to lowest', () => {
		const e = startEncounter(
			{ ...newEncounter(), combatants: [npc('Low', 2), npc('High', 9), npc('Mid', 5)] },
			dice(1, 1, 1)
		);
		expect(names(e)).toEqual(['High', 'Mid', 'Low']);
		expect(current(e)).toBe('High');
		expect(e.round).toBe(1);
	});

	it('re-rolls ties until there is a winner', () => {
		const tied = [npc('A', 5), npc('B', 5)].map((c) => rollInitiative(c, dice(5)));
		// First re-roll ties again (4, 4); then B wins (2, 9).
		expect(orderQueue(tied, dice(4, 4, 2, 9)).map((c) => c.name)).toEqual(['B', 'A']);
	});

	it('keeps a settled tie the same on later sorts', () => {
		const tied = [npc('A', 5), npc('B', 5)].map((c) => rollInitiative(c, dice(5)));
		const once = orderQueue(tied, dice(2, 9));
		expect(orderQueue(once, dice()).map((c) => c.name)).toEqual(['B', 'A']); // no dice needed
	});

	it('finishes a tie bigger than a d10 has faces (Codex, #55 review)', () => {
		const eleven = Array.from({ length: 11 }, (_, i) => ({ ...npc(`N${i}`), initiative: 10 }));
		let n = 0;
		const die = () => (n++ % 10) + 1; // a fair-looking cycle of 1–10
		const order = orderQueue(eleven, die);
		expect(new Set(order.map((c) => c.id)).size).toBe(11);
		expect(new Set(order.map((c) => c.tiebreak)).size).toBe(11);
		expect(n).toBeLessThan(100);
	});

	it('only re-rolls those still tied, and winners stay ahead', () => {
		const tied = ['A', 'B', 'C'].map((name) => ({ ...npc(name), initiative: 10 }));
		// A 9, B 4, C 4: A is settled, then only B and C roll (2, 7).
		expect(orderQueue(tied, dice(9, 4, 4, 2, 7)).map((c) => c.name)).toEqual(['A', 'C', 'B']);
	});

	it('keeps a settled order when a latecomer ties with it', () => {
		const settled = orderQueue(
			['A', 'B'].map((name) => ({ ...npc(name), initiative: 10 })),
			dice(9, 4)
		);
		const late = [...settled, { ...npc('Late'), initiative: 10 }, { ...npc('Later'), initiative: 10 }];
		// Only the two newcomers (both unsettled) roll: 3, 8.
		expect(orderQueue(late, dice(3, 8)).map((c) => c.name)).toEqual(['A', 'B', 'Later', 'Late']);
	});

	it('keeps a typed-in initiative instead of rolling', () => {
		const typed = { ...npc('Typed', 1), initiative: 20 };
		const e = startEncounter({ ...newEncounter(), combatants: [npc('Rolled', 9), typed] }, dice(1));
		expect(names(e)).toEqual(['Typed', 'Rolled']);
	});

	it('does not start with nobody able to act', () => {
		expect(startEncounter(newEncounter(), dice()).started).toBe(false);
	});
});

describe('turns and rounds', () => {
	it('walks the queue and starts a new Round from the top', () => {
		let e = fight(npc('A', 9), npc('B', 5));
		e = nextTurn(e);
		expect([current(e), e.round]).toEqual(['B', 1]);
		e = nextTurn(e);
		expect([current(e), e.round]).toEqual(['A', 2]);
	});

	it('steps back across a Round, but not before the first Turn', () => {
		let e = nextTurn(nextTurn(fight(npc('A', 9), npc('B', 5))));
		e = previousTurn(e);
		expect([current(e), e.round]).toEqual(['B', 1]);
		e = previousTurn(previousTurn(e));
		expect([current(e), e.round]).toEqual(['A', 1]);
	});

	it('skips anyone who is out', () => {
		let e = fight(npc('A', 9), npc('B', 5), npc('C', 1));
		e = setOut(e, 'B', true);
		e = nextTurn(e);
		expect(current(e)).toBe('C');
	});

	it('moves on when the current combatant goes out', () => {
		const e = setOut(fight(npc('A', 9), npc('B', 5)), 'A', true);
		expect(current(e)).toBe('B');
	});

	it('does not loop forever when everyone is out', () => {
		let e = fight(npc('A', 9), npc('B', 5));
		e = setOut(setOut(e, 'B', true), 'A', true);
		expect(nextTurn(e).round).toBe(e.round);
	});

	it('moves on when the current combatant is removed', () => {
		const e = removeCombatant(fight(npc('A', 9), npc('B', 5)), 'A');
		expect(names(e)).toEqual(['B']);
		expect(current(e)).toBe('B');
	});

	it('slots a latecomer into the queue without changing whose Turn it is', () => {
		let e = fight(npc('A', 9), npc('B', 3));
		e = nextTurn(e); // B's Turn
		e = addCombatants(e, [npc('Late', 5)], dice(1));
		expect(names(e)).toEqual(['A', 'Late', 'B']);
		expect(current(e)).toBe('B');
	});
});

describe('damage uses the sheet rules', () => {
	it('subtracts SP, then HP, and ablates by 1 when damage gets through', () => {
		const e = damage(fight(npc('A', 5, 30, 11)), 'A', 14, 'body');
		expect(get(e, 'A').hp).toBe(27);
		expect(spOf(get(e, 'A'))).toEqual({ head: 11, body: 10 });
	});

	it('stops a hit that does not beat the SP, with no ablation', () => {
		const e = damage(fight(npc('A', 5, 30, 11)), 'A', 11, 'body');
		expect(get(e, 'A').hp).toBe(30);
		expect(spOf(get(e, 'A')).body).toBe(11);
	});

	it('doubles what gets through on an aimed head shot', () => {
		const e = damage(fight(npc('A', 5, 30, 11)), 'A', 14, 'head');
		expect(get(e, 'A').hp).toBe(24);
	});

	it('direct damage ignores armor; HP stays between 0 and max', () => {
		let e = damage(fight(npc('A', 5, 30, 11)), 'A', 40, 'direct');
		expect(get(e, 'A').hp).toBe(0);
		e = heal(e, 'A', 99);
		expect(get(e, 'A').hp).toBe(30);
	});
});

describe('adding combatants', () => {
	const input = { name: ' Ganger ', ref: 6, hp: 20, spHead: 0, spBody: 7 };

	it('numbers a group of NPCs, each with its own armor', () => {
		let n = 0;
		const gang = makeNpcs(() => `g${++n}`, input, 3);
		expect(gang.map((c) => c.name)).toEqual(['Ganger 1', 'Ganger 2', 'Ganger 3']);
		expect(spOf(gang[0])).toEqual({ head: 0, body: 7 });
		expect(gang[1].gear[0].id).not.toBe(gang[0].gear[0].id);
	});

	it('leaves a single NPC unnumbered', () => {
		expect(makeNpcs(() => 'x', input, 1)[0].name).toBe('Ganger');
	});

	it("brings a saved character's REF (with armor penalty), HP and armor", () => {
		const stats = Object.fromEntries(rulesets[0].stats.map((s) => [s.id, 6]));
		const character: Character = {
			id: 'c1',
			name: 'Gecko',
			rulesetId: rulesets[0].id,
			stats,
			skills: {},
			extra: {
				currentHp: 12,
				gear: [{ id: 'a', kind: 'armor', name: 'Flak', sp: 15, location: 'body', penalty: -4 }]
			}
		};
		const pc = makePc('p1', character);
		expect(pc).toMatchObject({ name: 'Gecko', characterId: 'c1', ref: 2, hp: 12 });
		expect(spOf(pc).body).toBe(15);
	});
});

describe('parseEncounter', () => {
	it('survives a save and reload', () => {
		const e = nextTurn(fight(npc('A', 9), npc('B', 5)));
		expect(parseEncounter(JSON.parse(JSON.stringify(e)))).toEqual(e);
	});

	it.each([[null], ['nope'], [{ combatants: [{ id: 1 }] }], [{ combatants: 'x' }]])('starts fresh from %j', (bad) => {
		expect(parseEncounter(bad)).toEqual(newEncounter());
	});

	it.each([
		['null gear', [null]],
		['gear with no id', [{ kind: 'armor' }]],
		['bad armor', [{ id: 'a', kind: 'armor', name: 'X', sp: 'lots', location: 'body' }]]
	])('starts fresh from %s (Codex, #55 review)', (_name, gear) => {
		const e = fight(npc('A', 9));
		const broken = { ...e, combatants: [{ ...e.combatants[0], gear }] };
		expect(parseEncounter(broken)).toEqual(newEncounter());
	});

	it('starts fresh from duplicate combatant ids', () => {
		const e = fight(npc('A', 9));
		expect(parseEncounter({ ...e, combatants: [e.combatants[0], e.combatants[0]] })).toEqual(newEncounter());
	});

	it('falls back to setup if the current combatant is missing', () => {
		const e = fight(npc('A', 9));
		expect(parseEncounter({ ...e, currentId: 'gone' })).toMatchObject({ started: false, round: 0 });
	});
});
