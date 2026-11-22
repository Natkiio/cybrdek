// Core pp. 200–208, 212: NET combat math and original effect summaries.
import { rollDie, skillCheck, type RollResult } from '#lib/engine/dice.ts';
import type { Combatant, Encounter } from '#lib/combat/encounter.ts';
import { PROGRAMS } from './programs.ts';
import { BLACK_ICE, DEMONS } from './net-security.ts';
import { netActions } from './interface.ts';
import { actionPenalty, woundState } from './wounds.ts';
import type { GearItem } from './gear.ts';
export type Phase = 'inactive' | 'active' | 'derezzed' | 'destroyed' | 'backup';
export interface NetProgram {
	id: string;
	defId: string;
	rez: number;
	phase: Phase;
	activatedRound: number;
	used: boolean;
	savedPhase: 'inactive' | 'active' | 'derezzed' | null;
}
export interface NetUnit {
	kind: 'runner' | 'ice' | 'demon';
	defId: string;
	rank: number;
	deckId: string;
	programs: NetProgram[];
	hardware: string[];
	jackedIn: boolean;
	spent: number;
	meat: boolean;
	actionPenalty: number;
	pendingPenalty: number;
	slideUsed: boolean;
	targetId: string | null;
	encountered: string[];
	fire: boolean;
	glue: number;
	conditions: string[];
}
export interface NetDice {
	check: (base: number) => RollResult;
	d6: () => number;
	pick: (length: number) => number;
}
export const NET_DICE: NetDice = {
	check: skillCheck,
	d6: () => rollDie(6),
	pick: (n) => rollDie(n) - 1
};
const base = (): NetUnit => ({
	kind: 'runner',
	defId: '',
	rank: 0,
	deckId: '',
	programs: [],
	hardware: [],
	jackedIn: true,
	spent: 0,
	meat: false,
	actionPenalty: 0,
	pendingPenalty: 0,
	slideUsed: false,
	targetId: null,
	encountered: [],
	fire: false,
	glue: 0,
	conditions: []
});
export function runnerNet(deck: GearItem, rank: number): NetUnit {
	if (!deck.cyberdeck || !Number.isInteger(rank) || rank < 1 || rank > 10)
		throw Error('Choose a configured deck and Interface rank 1–10.');
	return {
		...base(),
		rank,
		deckId: deck.id,
		hardware: deck.cyberdeck.hardware.map((h) => h.defId),
		programs: deck.cyberdeck.programs
			.filter((p) => p.loaded)
			.map((p) => ({
				id: p.id,
				defId: p.defId,
				rez: PROGRAMS.find((d) => d.id === p.defId)!.rez,
				phase: 'inactive',
				activatedRound: -1,
				used: false,
				savedPhase: null
			}))
	};
}
export function securityCombatant(id: string, kind: 'ice' | 'demon', defId: string): Combatant {
	const def = (kind === 'ice' ? BLACK_ICE : DEMONS).find((d) => d.id === defId);
	if (!def) throw Error('Unknown NET security.');
	return {
		id,
		name: `${kind === 'ice' ? 'ICE' : 'DEMON'} · ${def.name}`,
		ref: 0,
		roll: null,
		initiative: null,
		tiebreak: 0,
		hp: def.rez,
		maxHp: def.rez,
		gear: [],
		out: false,
		net: { ...base(), kind, defId }
	};
}
export function validNetUnit(value: unknown): value is NetUnit {
	if (!value || typeof value !== 'object') return false;
	const n = value as NetUnit;
	const whole = (x: unknown, min: number, max: number) =>
		typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
	return (
		['runner', 'ice', 'demon'].includes(n.kind) &&
		typeof n.defId === 'string' &&
		typeof n.deckId === 'string' &&
		whole(n.rank, 0, 10) &&
		whole(n.spent, 0, 100) &&
		whole(n.actionPenalty, 0, 100) &&
		whole(n.pendingPenalty, 0, 100) &&
		whole(n.glue, 0, 6) &&
		[n.jackedIn, n.meat, n.slideUsed, n.fire].every((v) => typeof v === 'boolean') &&
		(n.targetId === null || typeof n.targetId === 'string') &&
		[n.hardware, n.encountered, n.conditions].every(
			(a) =>
				Array.isArray(a) &&
				a.length <= 200 &&
				a.every((v) => typeof v === 'string' && v.length <= 300)
		) &&
		Array.isArray(n.programs) &&
		n.programs.length <= 100 &&
		new Set(n.programs.map((p) => p?.id)).size === n.programs.length &&
		n.programs.every(
			(p) =>
				p &&
				typeof p.id === 'string' &&
				p.id.length > 0 &&
				PROGRAMS.some((d) => d.id === p.defId) &&
				whole(p.rez, 0, 7) &&
				['inactive', 'active', 'derezzed', 'destroyed', 'backup'].includes(p.phase) &&
				whole(p.activatedRound, -1, 100000) &&
				typeof p.used === 'boolean' &&
				(p.savedPhase === null || ['inactive', 'active', 'derezzed'].includes(p.savedPhase))
		) &&
		(n.kind === 'runner'
			? n.rank >= 1
			: (n.kind === 'ice' ? BLACK_ICE : DEMONS).some((d) => d.id === n.defId))
	);
}
// Clone only fields this engine mutates; reading works with Svelte proxies too.
const clone = (f: Encounter): Encounter => ({
	...f,
	combatants: f.combatants.map((c) => ({
		...c,
		...(c.net
			? {
					net: {
						...c.net,
						programs: c.net.programs.map((p) => ({ ...p })),
						hardware: [...c.net.hardware],
						encountered: [...c.net.encountered],
						conditions: [...c.net.conditions]
					}
				}
			: {})
	}))
});
const unit = (f: Encounter, id: string) => {
	const c = f.combatants.find((c) => c.id === id);
	if (!c?.net) throw Error('Choose a NET participant.');
	return c;
};
const active = (c: Combatant, id: string) =>
	c.net!.programs.some((p) => p.defId === id && p.phase === 'active');
const interfaceBase = (c: Combatant) => c.net!.rank + actionPenalty(woundState(c.hp, c.maxHp));
const hardware = (c: Combatant, id: string) => c.net!.hardware.includes(id);
const diceTotal = (count: number, d: NetDice) =>
	Array.from({ length: count }, d.d6).reduce((a, b) => a + b, 0);
function action(f: Encounter, c: Combatant, meat = false) {
	if (!f.started || f.currentId !== c.id || c.out || c.hp <= 0)
		throw Error('Wait for this participant’s Turn.');
	const n = c.net!;
	if (n.kind === 'runner' && !n.jackedIn && !meat) throw Error('The runner is jacked out.');
	const budget =
		n.kind === 'ice'
			? 1
			: n.kind === 'demon'
				? DEMONS.find((d) => d.id === n.defId)!.netActions
				: Math.max(2, netActions(n.rank) - n.actionPenalty);
	if (n.meat || (meat && n.spent > 0) || (!meat && n.spent >= budget))
		throw Error('No actions remaining this Turn.');
	if (meat) n.meat = true;
	else n.spent++;
}
export function beginNetTurn(f: Encounter): Encounter {
	const next = clone(f);
	const c = next.combatants.find((c) => c.id === next.currentId);
	if (c?.net) {
		const n = c.net;
		n.spent = 0;
		n.meat = false;
		n.slideUsed = false;
		n.actionPenalty = n.pendingPenalty;
		n.pendingPenalty = 0;
	}
	return next;
}
export function endNetTurn(f: Encounter): Encounter {
	const next = clone(f);
	const c = next.combatants.find((c) => c.id === next.currentId);
	if (c?.net?.fire) c.hp = Math.max(0, c.hp - 2);
	return next;
}
export function programState(
	f: Encounter,
	actorId: string,
	copyId: string,
	activate: boolean
): Encounter {
	const next = clone(f),
		c = unit(next, actorId),
		n = c.net!,
		p = n.programs.find((p) => p.id === copyId);
	if (!p || n.kind !== 'runner' || ['destroyed', 'backup'].includes(p.phase))
		throw Error('That program is unavailable.');
	const def = PROGRAMS.find((d) => d.id === p.defId)!;
	if (def.category === 'Attacker') throw Error('Use an Attacker through ATTACK.');
	if (
		activate &&
		(p.phase !== 'inactive' ||
			p.activatedRound === f.round ||
			(def.category === 'Defender' && (p.used || active(c, p.defId))))
	)
		throw Error('This copy cannot activate now.');
	if (!activate && !['active', 'derezzed'].includes(p.phase))
		throw Error('This copy is not running.');
	if (next.started) action(next, c);
	else if (!n.jackedIn || c.hp <= 0) throw Error('Choose a live, jacked-in runner.');
	p.phase = activate ? 'active' : 'inactive';
	if (activate) {
		p.rez = def.rez;
		p.activatedRound = f.round;
		p.used = true;
	}
	return next;
}
function destroy(c: Combatant, p: NetProgram) {
	if (hardware(c, 'backup-drive')) {
		p.savedPhase = p.phase as 'inactive' | 'active' | 'derezzed';
		p.phase = 'backup';
	} else {
		p.phase = 'destroyed';
		p.rez = 0;
	}
}
function brain(c: Combatant, amount: number, ordinary: boolean) {
	if (ordinary && active(c, 'shield')) {
		const p = c.net!.programs.find((p) => p.defId === 'shield' && p.phase === 'active')!;
		p.phase = 'derezzed';
		p.rez = 0;
		return;
	}
	c.hp = Math.max(0, c.hp - Math.max(0, amount - (active(c, 'armor') ? 4 : 0)));
}
function programDamage(c: Combatant, p: NetProgram, amount: number, lethal: boolean) {
	if (lethal && amount >= p.rez) {
		destroy(c, p);
		return;
	}
	p.rez = Math.max(0, p.rez - amount);
	if (p.rez === 0) p.phase = 'derezzed';
}
function pickProgram(c: Combatant, d: NetDice, filter: (p: NetProgram) => boolean) {
	const ps = c.net!.programs.filter(filter);
	return ps.length ? ps[d.pick(ps.length)] : undefined;
}
function damageRez(c: Combatant, amount: number) {
	c.hp = Math.max(0, c.hp - amount);
	if (c.hp === 0) c.out = true;
}
function unsafe(f: Encounter, c: Combatant, d: NetDice, exclude?: string) {
	// Each encountered surviving ICE gets its effect once, without another attack roll.
	const ids = [...c.net!.encountered];
	c.net!.jackedIn = false;
	for (const id of ids) {
		const ice = f.combatants.find((i) => i.id === id && i.net?.kind === 'ice' && i.hp > 0);
		if (ice && id !== exclude) iceEffect(f, ice, c, d, true);
	}
	for (const p of c.net!.programs)
		if (p.phase === 'active' || p.phase === 'derezzed') p.phase = 'inactive';
	c.net!.encountered = [];
	for (const ice of f.combatants)
		if (ice.net?.kind === 'ice' && ice.net.targetId === c.id) ice.net.targetId = null;
	c.net!.conditions = c.net!.conditions.filter((s) => !s.startsWith('Skunk '));
}
function iceEffect(f: Encounter, ice: Combatant, c: Combatant, d: NetDice, exiting = false) {
	const id = ice.net!.defId;
	if (['dragon', 'killer', 'sabertooth'].includes(id)) {
		const p = pickProgram(c, d, (p) => p.phase === 'active');
		if (p) programDamage(c, p, diceTotal(id === 'killer' ? 4 : 6, d), true);
		return;
	}
	if (id === 'asp') {
		const p = pickProgram(c, d, (p) => !['destroyed', 'backup'].includes(p.phase));
		if (p) destroy(c, p);
	} else if (id === 'hellhound') {
		brain(c, diceTotal(2, d), false);
		if (!hardware(c, 'insulated-wiring')) c.net!.fire = true;
	} else if (id === 'giant' || id === 'kraken') {
		brain(c, diceTotal(3, d), false);
		if (id === 'giant' && !hardware(c, 'krash-barrier') && !exiting) unsafe(f, c, d, ice.id);
		if (id === 'kraken') {
			c.net!.glue = Math.max(c.net!.glue, 1);
			c.net!.conditions.push(
				'Kraken: movement and safe exit blocked until the end of your next Turn.'
			);
		}
	} else if (id === 'raven') {
		const p = pickProgram(
			c,
			d,
			(p) => p.phase === 'active' && PROGRAMS.find((x) => x.id === p.defId)?.category === 'Defender'
		);
		if (p) {
			p.rez = 0;
			p.phase = 'derezzed';
		}
		brain(c, d.d6(), false);
	} else if (id === 'liche' || id === 'scorpion') {
		c.net!.conditions.push(
			`${id === 'liche' ? 'INT/REF/DEX' : 'MOVE'} −${d.d6()} for 1 hour (minimum 1). Apply to meatspace checks.`
		);
	} else if (id === 'skunk') {
		const prefix = `Skunk ${ice.id}:`;
		if (!f.combatants.some((other) => other.net?.conditions.some((s) => s.startsWith(prefix))))
			c.net!.conditions.push(`${prefix} Slide −2 until this ICE is Derezzed.`);
	} else if (id === 'wisp') {
		brain(c, d.d6(), false);
		c.net!.pendingPenalty++;
	}
}
export interface NetModifiers {
	attack?: number;
	defense?: number;
}
function extra(value: number | undefined): number {
	if (value === undefined) return 0;
	if (!Number.isInteger(value) || Math.abs(value) > 100)
		throw Error('Use a whole-number check modifier from −100 to 100.');
	return value;
}
export interface NetOutcome {
	encounter: Encounter;
	message: string;
	attack?: RollResult;
	defense?: RollResult;
}
export function netAttack(
	f: Encounter,
	actorId: string,
	targetId: string,
	weapon: string,
	programId: string | null,
	d: NetDice = NET_DICE,
	modifiers: NetModifiers = {}
): NetOutcome {
	const next = clone(f),
		a = unit(next, actorId),
		t = unit(next, targetId);
	if (a.id === t.id || a.hp <= 0 || t.hp <= 0 || (t.net!.kind === 'runner' && !t.net!.jackedIn))
		throw Error('Choose a live enemy NET target.');
	let atk: number;
	const an = a.net!,
		tn = t.net!;
	let def: (typeof PROGRAMS)[number] | undefined;
	if (an.kind === 'runner') {
		if (weapon !== 'zap') {
			const p = an.programs.find((p) => p.id === weapon);
			def = PROGRAMS.find((x) => x.id === p?.defId);
			if (
				!p ||
				!def ||
				def.category !== 'Attacker' ||
				p.phase !== 'inactive' ||
				p.activatedRound === f.round ||
				(def.id === 'superglue' && p.used)
			)
				throw Error('Choose an available Attacker copy.');
			if (def.target === 'Netrunner' && programId)
				throw Error('Anti-personnel programs target the runner, not a program.');
			if ((def.target === 'Netrunner') !== (tn.kind === 'runner')) {
				if (!(def.target === 'Program' && programId)) throw Error('Wrong target for this program.');
			}
			atk = interfaceBase(a) + (active(t, 'flak') ? 0 : def.atk);
			p.activatedRound = f.round;
			p.used = true;
		} else atk = interfaceBase(a);
	} else if (an.kind === 'ice') {
		if (tn.kind !== 'runner' || an.targetId !== t.id)
			throw Error('This ICE must pursue this runner before attacking.');
		if (!['dragon', 'killer', 'sabertooth'].includes(an.defId) && programId)
			throw Error('Anti-personnel ICE attacks the runner, not a program.');
		atk = BLACK_ICE.find((x) => x.id === an.defId)!.atk;
		if (['dragon', 'killer', 'sabertooth'].includes(an.defId)) {
			const p = pickProgram(t, d, (p) => p.phase === 'active');
			if (!p) throw Error('No rezzed programs to target.');
			programId = p.id;
		}
	} else {
		if (tn.kind !== 'runner' || programId) throw Error('Demons Zap Netrunners.');
		atk = DEMONS.find((x) => x.id === an.defId)!.interface;
	}
	const targetProgram = programId
		? tn.programs.find((p) => p.id === programId && p.phase === 'active')
		: undefined;
	if (programId && !targetProgram) throw Error('Choose a rezzed target program.');
	const defenseBase = targetProgram
		? PROGRAMS.find((x) => x.id === targetProgram.defId)!.def
		: tn.kind === 'runner'
			? interfaceBase(t)
			: tn.kind === 'ice'
				? BLACK_ICE.find((x) => x.id === tn.defId)!.def
				: DEMONS.find((x) => x.id === tn.defId)!.interface;
	action(next, a);
	const attack = d.check(atk + extra(modifiers.attack)),
		defense = d.check(defenseBase + extra(modifiers.defense));
	if (attack.total <= defense.total)
		return { encounter: next, attack, defense, message: `${a.name} misses ${t.name}.` };
	if (an.kind === 'ice') {
		// Use the same randomly selected program for defense and damage.
		if (targetProgram)
			programDamage(t, targetProgram, diceTotal(an.defId === 'killer' ? 4 : 6, d), true);
		else iceEffect(next, a, t, d);
	} else if (!def) {
		if (targetProgram) programDamage(t, targetProgram, d.d6(), false);
		else if (tn.kind === 'runner') brain(t, d.d6(), false);
		else damageRez(t, d.d6());
	} else if (def.target === 'Program') {
		const blackIceTarget = !targetProgram && tn.kind !== 'runner';
		const amount = diceTotal((def.id === 'sword') === blackIceTarget ? 3 : 2, d);
		if (targetProgram) programDamage(t, targetProgram, amount, false);
		else damageRez(t, amount);
	} else {
		switch (def.id) {
			case 'hellbolt':
				brain(t, diceTotal(2, d), true);
				if (!hardware(t, 'insulated-wiring')) tn.fire = true;
				break;
			case 'vrizzbolt':
				brain(t, d.d6(), true);
				tn.pendingPenalty++;
				break;
			case 'deckkrash':
				if (!hardware(t, 'krash-barrier')) unsafe(next, t, d);
				break;
			case 'nervescrub':
				tn.conditions.push(
					`INT/REF/DEX −${d.d6()} for 1 hour (minimum 1). Apply to meatspace checks.`
				);
				break;
			case 'poison-flatline': {
				const p = pickProgram(t, d, (p) => !['destroyed', 'backup'].includes(p.phase));
				if (p) destroy(t, p);
				break;
			}
			case 'superglue':
				tn.glue = d.d6();
				tn.conditions.push(`Superglue: movement and safe exit blocked for ${tn.glue} rounds.`);
				break;
		}
	}
	return {
		encounter: next,
		attack,
		defense,
		message: `${a.name} hits ${t.name}: ${def?.name ?? (an.kind === 'ice' ? an.defId : 'Zap')}.`
	};
}
export function encounterIce(
	f: Encounter,
	iceId: string,
	runnerId: string,
	d: NetDice = NET_DICE,
	modifiers: NetModifiers = {}
): NetOutcome {
	const next = clone(f),
		ice = unit(next, iceId),
		c = unit(next, runnerId);
	if (
		ice.net!.kind !== 'ice' ||
		c.net!.kind !== 'runner' ||
		!c.net!.jackedIn ||
		ice.hp <= 0 ||
		ice.net!.targetId !== null
	)
		throw Error('Choose new ICE and a jacked-in runner.');
	if (!c.net!.encountered.includes(ice.id)) c.net!.encountered.push(ice.id);
	ice.net!.targetId = c.id;
	const attack = d.check(
		BLACK_ICE.find((x) => x.id === ice.net!.defId)!.spd + extra(modifiers.attack)
	);
	const defense = d.check(
		interfaceBase(c) +
			extra(modifiers.defense) +
			c.net!.programs.filter((p) => p.defId === 'speedy-gonzalvez' && p.phase === 'active').length *
				2
	);
	if (attack.total > defense.total) iceEffect(next, ice, c, d);
	return {
		encounter: next,
		attack,
		defense,
		message:
			attack.total > defense.total
				? 'ICE wins the speed contest; its effect applies immediately.'
				: 'Runner avoids the initial ICE effect.'
	};
}
export function slideIce(
	f: Encounter,
	runnerId: string,
	iceId: string,
	d: NetDice = NET_DICE,
	modifiers: NetModifiers = {}
): NetOutcome {
	const next = clone(f),
		c = unit(next, runnerId),
		ice = unit(next, iceId);
	if (
		c.net!.kind !== 'runner' ||
		ice.net!.kind !== 'ice' ||
		ice.net!.targetId !== c.id ||
		ice.hp <= 0 ||
		c.net!.slideUsed
	)
		throw Error('Slide once per Turn against pursuing non-Demon ICE.');
	action(next, c);
	c.net!.slideUsed = true;
	const penalty =
		c.net!.conditions.filter(
			(s) =>
				s.startsWith('Skunk ') &&
				next.combatants.some((i) => i.id === s.split(':')[0].slice(6) && i.hp > 0)
		).length * 2;
	const attack = d.check(interfaceBase(c) - penalty + extra(modifiers.attack)),
		defense = d.check(
			BLACK_ICE.find((x) => x.id === ice.net!.defId)!.per + extra(modifiers.defense)
		);
	if (attack.total > defense.total) ice.net!.targetId = null;
	return {
		encounter: next,
		attack,
		defense,
		message:
			attack.total > defense.total
				? 'Slide succeeded. Move to an adjacent unblocked floor; this ICE stops pursuing.'
				: 'Slide failed.'
	};
}
export function jackRunner(
	f: Encounter,
	id: string,
	safe: boolean,
	d: NetDice = NET_DICE
): Encounter {
	const next = clone(f),
		c = unit(next, id);
	if (c.net!.kind !== 'runner') throw Error('Choose a runner.');
	if (safe) {
		if (c.net!.glue > 0) throw Error('Safe Jack Out is blocked.');
		action(next, c);
		c.net!.jackedIn = false;
	} else unsafe(next, c, d);
	for (const p of c.net!.programs)
		if (['active', 'derezzed'].includes(p.phase)) p.phase = 'inactive';
	for (const ice of next.combatants)
		if (ice.net?.kind === 'ice' && ice.net.targetId === c.id) ice.net.targetId = null;
	c.net!.conditions = c.net!.conditions.filter((s) => !s.startsWith('Skunk '));
	return next;
}
export function meatNetAction(
	f: Encounter,
	id: string,
	task: 'extinguish' | 'restore' | 'meat' | 'control'
): Encounter {
	const next = clone(f),
		c = unit(next, id);
	if (c.net!.kind === 'ice' || (c.net!.kind === 'demon' && task !== 'control'))
		throw Error('This participant cannot use that action.');
	if (task === 'restore' && !hardware(c, 'backup-drive')) throw Error('No Backup Drive.');
	if (
		task === 'restore' &&
		c.net!.programs.some(
			(p) =>
				p.phase === 'backup' &&
				p.savedPhase === 'active' &&
				PROGRAMS.find((d) => d.id === p.defId)?.category === 'Defender' &&
				active(c, p.defId)
		)
	)
		throw Error('Deactivate the other Defender copy before restoring the backup.');
	action(next, c, task !== 'control');
	if (task === 'extinguish') c.net!.fire = false;
	if (task === 'restore')
		for (const p of c.net!.programs)
			if (p.phase === 'backup') {
				p.phase = p.savedPhase ?? 'inactive';
				p.savedPhase = null;
			}
	return next;
}

export function enterRunner(f: Encounter, id: string): Encounter {
	const next = clone(f),
		c = unit(next, id);
	if (c.net!.kind !== 'runner' || c.net!.jackedIn) throw Error('Choose a jacked-out runner.');
	c.net!.jackedIn = true;
	action(next, c);
	c.net!.encountered = [];
	c.net!.glue = 0;
	for (const p of c.net!.programs) {
		p.used = false;
		p.activatedRound = -1;
		if (!['destroyed', 'backup'].includes(p.phase)) {
			p.phase = 'inactive';
			p.rez = PROGRAMS.find((d) => d.id === p.defId)!.rez;
		}
	}
	return next;
}
