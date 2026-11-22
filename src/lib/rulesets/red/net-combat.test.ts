import { expect, it } from 'vitest';
import {
	newEncounter,
	makeNpc,
	addCombatants,
	startEncounter,
	nextTurn
} from '#lib/combat/encounter.ts';
import { newDeck } from './cyberdeck.ts';
import {
	runnerNet,
	securityCombatant,
	netAttack,
	encounterIce,
	slideIce,
	programState,
	jackRunner,
	enterRunner,
	beginNetTurn,
	endNetTurn,
	meatNetAction,
	validNetUnit,
	type NetDice
} from './net-combat.ts';
const dice = (attack = 9, defense = 2, d6 = 4): NetDice => {
	let index = 0;
	return {
		check: (base) => ({
			rolls: [index++ % 2 === 0 ? attack : defense],
			modifier: base,
			total: base + (index % 2 === 1 ? attack : defense)
		}),
		d6: () => d6,
		pick: () => 0
	};
};
function fixture(iceId = 'hellhound'): import('#lib/combat/encounter.ts').Encounter {
	const runner = makeNpc('r', { name: 'Runner', ref: 8, hp: 40, spHead: 11, spBody: 11 });
	runner.net = runnerNet(
		{
			id: 'deck',
			kind: 'item',
			name: 'Deck',
			cyberdeck: {
				...newDeck(),
				programs: [
					'sword',
					'banhammer',
					'armor',
					'shield',
					'worm',
					'hellbolt',
					'poison-flatline',
					'superglue'
				].map((defId, i) => ({ id: `p${i}`, defId, loaded: true }))
			}
		},
		4
	);
	const ice = securityCombatant('ice', 'ice', iceId);
	ice.net!.targetId = 'r';
	runner.net.encountered = ['ice'];
	return { ...newEncounter(), started: true, round: 1, currentId: 'r', combatants: [runner, ice] };
}
it('NET security enters at the top without mutating the old queue; meatspace keeps normal initiative', () => {
	const f = fixture();
	f.started = false;
	f.currentId = null;
	const before = structuredClone(f);
	const started = startEncounter(f, () => 5);
	expect(started.combatants[0].id).toBe('ice');
	expect(f).toEqual(before);
	const added = addCombatants(started, [securityCombatant('d', 'demon', 'imp')], () => 3);
	expect(added.combatants[0].id).toBe('d');
});
it('Sword and Banhammer use the correct damage dice against ICE and ordinary programs, with ties defending', () => {
	let f = fixture();
	const hit = netAttack(f, 'r', 'ice', 'p0', null, dice());
	expect(hit.encounter.combatants[1].hp).toBe(8);
	expect(f.combatants[1].hp).toBe(20);
	expect(netAttack(hit.encounter, 'r', 'ice', 'p1', null, dice()).encounter.combatants[1].hp).toBe(
		0
	);
	const target = fixture().combatants[0];
	target.id = 't';
	target.net!.programs[4].phase = 'active';
	target.net!.programs[4].rez = 7;
	f.combatants.push(target);
	const ordinary = netAttack(f, 'r', 't', 'p1', 'p4', dice());
	expect(ordinary.encounter.combatants[2].net!.programs[4].phase).toBe('derezzed');
	const tie = netAttack(f, 'r', 'ice', 'zap', null, dice(2, 4));
	expect(tie.message).toContain('misses');
});
it('activation is per-copy and once per round; derezzed Boosters need deactivate then activate; Defenders are once per run', () => {
	let f = programState(fixture(), 'r', 'p2', true);
	expect(() => programState(f, 'r', 'p2', true)).toThrow();
	f = programState(f, 'r', 'p2', false);
	f.round = 2;
	f = beginNetTurn(f);
	expect(() => programState(f, 'r', 'p2', true)).toThrow();
	f = programState(f, 'r', 'p4', true);
	f.combatants[0].net!.programs[4].phase = 'derezzed';
	f.round = 3;
	f = beginNetTurn(f);
	expect(() => programState(f, 'r', 'p4', true)).toThrow();
	f = programState(f, 'r', 'p4', false);
	f = programState(f, 'r', 'p4', true);
	expect(f.combatants[0].net!.programs[4].rez).toBe(7);
});
it('Armor reduces brain damage, Shield does not stop ICE/Zap, and fire deals direct HP at end of Turn', () => {
	let f = programState(fixture(), 'r', 'p2', true);
	f.currentId = 'ice';
	const hit = netAttack(f, 'ice', 'r', 'zap', null, dice()).encounter;
	expect(hit.combatants[0].hp).toBe(36);
	expect(hit.combatants[0].net!.fire).toBe(true);
	hit.currentId = 'r';
	expect(endNetTurn(hit).combatants[0].hp).toBe(34);
	hit.combatants[0].net!.hardware = ['insulated-wiring'];
	hit.combatants[0].net!.fire = false;
	hit.currentId = 'ice';
	hit.combatants[1].net!.spent = 0;
	expect(netAttack(hit, 'ice', 'r', 'zap', null, dice()).encounter.combatants[0].net!.fire).toBe(
		false
	);
});
it('anti-program ICE destroys on lethal REZ damage and Backup Drive preserves the exact saved program state', () => {
	const f = fixture('killer');
	f.currentId = 'ice';
	f.combatants[0].net!.hardware = ['backup-drive'];
	f.combatants[0].net!.programs[4].phase = 'active';
	const hit = netAttack(f, 'ice', 'r', 'zap', null, dice()).encounter;
	const copy = hit.combatants[0].net!.programs[4];
	expect(copy.phase).toBe('backup');
	expect(copy.rez).toBe(7);
	hit.currentId = 'r';
	const restored = meatNetAction(hit, 'r', 'restore');
	expect(restored.combatants[0].net!.programs[4].phase).toBe('active');
	expect(() => netAttack(restored, 'r', 'ice', 'zap', null, dice())).toThrow('No actions');
});
it('speed contest effect is immediate and records pursuit once; Slide is once per Turn and leaves encountered ICE dangerous on exit', () => {
	const f = fixture();
	f.combatants[0].net!.encountered = [];
	f.combatants[1].net!.targetId = null;
	const first = encounterIce(f, 'ice', 'r', dice()).encounter;
	expect(first.combatants[0].hp).toBe(32);
	expect(() => encounterIce(first, 'ice', 'r')).toThrow();
	const slid = slideIce(first, 'r', 'ice', dice()).encounter;
	expect(slid.combatants[1].net!.targetId).toBeNull();
	expect(() => slideIce(slid, 'r', 'ice')).toThrow();
	expect(jackRunner(slid, 'r', false, dice()).combatants[0].hp).toBe(24);
});
it('Giant unsafe exits do not recurse, KRASH Barrier prevents forced exits, and unsafe exit stops running programs', () => {
	const f = fixture('giant');
	f.currentId = 'ice';
	f.combatants[0].net!.programs[4].phase = 'active';
	const hit = netAttack(f, 'ice', 'r', 'zap', null, dice()).encounter;
	expect(hit.combatants[0].hp).toBe(28);
	expect(hit.combatants[0].net!.jackedIn).toBe(false);
	expect(hit.combatants[0].net!.programs[4].phase).toBe('inactive');
	f.combatants[0].net!.hardware = ['krash-barrier'];
	expect(netAttack(f, 'ice', 'r', 'zap', null, dice()).encounter.combatants[0].net!.jackedIn).toBe(
		true
	);
});
it('attacker copies auto-deactivate, cannot fire twice a Round, and program target classes are enforced', () => {
	const f = fixture();
	const hit = netAttack(f, 'r', 'ice', 'p0', null, dice()).encounter;
	expect(hit.combatants[0].net!.programs[0].phase).toBe('inactive');
	expect(() => netAttack(hit, 'r', 'ice', 'p0', null, dice())).toThrow();
	expect(() => netAttack(f, 'r', 'ice', 'p5', null, dice())).toThrow('Wrong target');
});
it('NET actions and Meat Actions exclude one another; new Turns reset budgets and new runs reset Defender use, not destruction', () => {
	let f = fixture();
	f = netAttack(f, 'r', 'ice', 'zap', null, dice()).encounter;
	expect(() => meatNetAction(f, 'r', 'meat')).toThrow();
	f = jackRunner(f, 'r', true);
	f.round = 2;
	f = beginNetTurn(f);
	f = enterRunner(f, 'r');
	expect(f.combatants[0].net!.jackedIn).toBe(true);
	f.combatants[0].net!.programs[2].phase = 'destroyed';
	f.combatants[0].net!.jackedIn = false;
	f = beginNetTurn(f);
	expect(enterRunner(f, 'r').combatants[0].net!.programs[2].phase).toBe('destroyed');
	expect(validNetUnit(f.combatants[0].net)).toBe(true);
	expect(validNetUnit({ ...f.combatants[0].net, rank: 99 })).toBe(false);
});
it.each([
	'asp',
	'hellhound',
	'giant',
	'kraken',
	'liche',
	'raven',
	'scorpion',
	'skunk',
	'wisp',
	'dragon',
	'killer',
	'sabertooth'
])('resolves the verified %s effect', (id) => {
	const f = fixture(id);
	f.currentId = 'ice';
	const r = f.combatants[0];
	r.net!.programs[4].phase = 'active';
	r.net!.programs[2].phase = 'active';
	const hit = netAttack(f, 'ice', 'r', 'zap', null, dice()).encounter.combatants[0];
	if (id === 'asp') expect(hit.net!.programs[0].phase).toBe('destroyed');
	if (id === 'hellhound') {
		expect(hit.hp).toBe(36);
		expect(hit.net!.fire).toBe(true);
	}
	if (id === 'giant') {
		expect(hit.hp).toBe(32);
		expect(hit.net!.jackedIn).toBe(false);
	}
	if (id === 'kraken') {
		expect(hit.hp).toBe(32);
		expect(hit.net!.glue).toBe(1);
	}
	if (id === 'liche' || id === 'scorpion')
		expect(hit.net!.conditions.join()).toContain('−4 for 1 hour');
	if (id === 'raven') {
		expect(hit.net!.programs[2].phase).toBe('derezzed');
		expect(hit.hp).toBe(36);
	}
	if (id === 'skunk') expect(hit.net!.conditions.join()).toContain('Slide −2');
	if (id === 'wisp') {
		expect(hit.hp).toBe(40);
		expect(hit.net!.pendingPenalty).toBe(1);
	}
	if (['dragon', 'killer', 'sabertooth'].includes(id))
		expect(hit.net!.programs[2].phase).toBe('destroyed');
});
it('an ICE slid away from can be encountered again, without duplicating unsafe-exit effects', () => {
	const f = fixture();
	f.combatants[1].net!.targetId = null;
	const hit = encounterIce(f, 'ice', 'r', dice()).encounter;
	expect(hit.combatants[0].net!.encountered).toEqual(['ice']);
});
it('Shield stops only the brain damage of an ordinary program, Flak zeroes its ATK, and the defender can restore on a new run', () => {
	const f = fixture();
	const target = fixture().combatants[0];
	target.id = 't';
	target.net!.programs[3].phase = 'active';
	f.combatants.push(target);
	const hit = netAttack(f, 'r', 't', 'p5', null, dice()).encounter.combatants[2];
	expect(hit.hp).toBe(40);
	expect(hit.net!.fire).toBe(true);
	expect(hit.net!.programs[3].phase).toBe('derezzed');
});
it.each(['hellbolt', 'deckkrash', 'nervescrub', 'poison-flatline', 'superglue', 'vrizzbolt'])(
	'resolves the %s anti-personnel effect',
	(id) => {
		const f = fixture();
		f.combatants[0].net!.programs.push({
			id: 'attack',
			defId: id,
			rez: 0,
			phase: 'inactive',
			activatedRound: -1,
			used: false,
			savedPhase: null
		});
		const t = fixture().combatants[0];
		t.id = 't';
		f.combatants.push(t);
		const hit = netAttack(f, 'r', 't', 'attack', null, dice()).encounter.combatants[2];
		if (id === 'hellbolt') {
			expect(hit.hp).toBe(32);
			expect(hit.net!.fire).toBe(true);
		}
		if (id === 'deckkrash') expect(hit.net!.jackedIn).toBe(false);
		if (id === 'nervescrub') expect(hit.net!.conditions.join()).toContain('INT/REF/DEX −4');
		if (id === 'poison-flatline') expect(hit.net!.programs[0].phase).toBe('destroyed');
		if (id === 'superglue') expect(hit.net!.glue).toBe(4);
		if (id === 'vrizzbolt') {
			expect(hit.hp).toBe(36);
			expect(hit.net!.pendingPenalty).toBe(1);
		}
	}
);
it('programs can be prepared before initiative; Flak removes ordinary Attacker ATK but not Interface', () => {
	const f = fixture();
	f.started = false;
	f.currentId = null;
	const prepared = programState(f, 'r', 'p2', true);
	expect(prepared.combatants[0].net!.spent).toBe(0);
	expect(prepared.combatants[0].net!.programs[2].phase).toBe('active');
	const fight = fixture();
	const target = fixture().combatants[0];
	target.id = 't';
	target.net!.programs.push({
		id: 'flak',
		defId: 'flak',
		rez: 7,
		phase: 'active',
		activatedRound: 0,
		used: true,
		savedPhase: null
	});
	fight.combatants.push(target);
	expect(netAttack(fight, 'r', 't', 'p5', null, dice()).attack!.modifier).toBe(4);
});
it('runner wound penalties affect Interface checks but do not reduce the rank-based action budget', () => {
	const f = fixture();
	f.combatants[0].hp = 19;
	expect(netAttack(f, 'r', 'ice', 'zap', null, dice()).attack!.modifier).toBe(2);
	f.combatants[1].net!.targetId = null;
	expect(encounterIce(f, 'ice', 'r', dice()).defense!.modifier).toBe(2);
});
it('applies explicit contextual modifiers separately from automatic wound penalties', () => {
	const result = netAttack(fixture(), 'r', 'ice', 'zap', null, dice(), { attack: 2, defense: -1 });
	expect(result.attack!.modifier).toBe(6);
	expect(result.defense!.modifier).toBe(1);
});
