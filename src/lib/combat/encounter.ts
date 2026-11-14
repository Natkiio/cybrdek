// =============================================================================
// encounter.ts: the combat tracker's rules (GM-3, #48). No browser, no storage.
// =============================================================================
//   Core pp. 127, 168:
//     Initiative = REF + 1d10, rolled once when combat starts.
//     The Initiative Queue runs highest to lowest; ties are rolled again until
//     someone wins. Each entity gets a Turn; at the bottom the queue repeats
//     from the top in the same order, as a new Round.
//
//   Damage and healing reuse the sheet's rules (armor.ts, wounds.ts), so a
//   combatant's armor is just gear. An NPC's SP becomes a head and a body item.
// =============================================================================

import { headMultiplierOf } from '#lib/rulesets/red/attacks.ts';
import { armoredStats, validArmorState, wornSp } from '#lib/rulesets/red/armor.ts';
import { gearOf, type ArmorLocation, type GearItem } from '#lib/rulesets/red/gear.ts';
import { derivedStats } from '#lib/rulesets/red/derived.ts';
import { clampHp, takeArmoredDamage } from '#lib/rulesets/red/wounds.ts';
import type { Character } from '#lib/engine/types.ts';

/** A d10 (or a fake one in tests). */
export type Die = () => number;

export interface Combatant {
	id: string;
	name: string;
	/** Set for a character saved on this device; damage is written back to it. */
	characterId?: string;
	/** Cloud PCs use an owner + id pair; an id alone is only a local reference. */
	characterOwnerId?: string;
	/** GM explicitly marks death; being out can also mean knockout or fleeing. */
	dead?: boolean;
	ref: number;
	roll: number | null; // the d10, null if the initiative was typed in
	initiative: number | null; // null until rolled or typed in
	tiebreak: number; // re-roll that settles equal initiative; higher goes first
	hp: number;
	maxHp: number;
	/** Snapshot of the saved character’s Cracked Skull effect; absent in older encounters. */
	headMultiplier?: 2 | 3;
	gear: GearItem[];
	out: boolean; // knocked out or fled: skipped in the queue
}

export interface Encounter {
	started: boolean;
	round: number;
	currentId: string | null;
	combatants: Combatant[]; // kept in queue order once started
}

export const newEncounter = (): Encounter => ({ started: false, round: 0, currentId: null, combatants: [] });

export interface NpcInput {
	name: string;
	ref: number;
	hp: number;
	spHead: number;
	spBody: number;
}

/** A quick NPC. Its SP becomes armor, so it ablates like anyone else's. */
export function makeNpc(id: string, input: NpcInput): Combatant {
	const armor = (location: ArmorLocation, sp: number): GearItem[] =>
		sp > 0 ? [{ id: `${id}-${location}`, kind: 'armor', name: `${location} armor`, sp, location, penalty: 0 }] : [];
	return {
		id,
		name: input.name.trim(),
		ref: input.ref,
		roll: null,
		initiative: null,
		tiebreak: 0,
		hp: input.hp,
		maxHp: input.hp,
		gear: [...armor('head', input.spHead), ...armor('body', input.spBody)],
		out: false
	};
}

/** Several NPCs at once: "Ganger 1", "Ganger 2"… Each gets its own Turn. */
export function makeNpcs(newId: () => string, input: NpcInput, count: number): Combatant[] {
	if (count <= 1) return [makeNpc(newId(), input)];
	return Array.from({ length: count }, (_, i) => makeNpc(newId(), { ...input, name: `${input.name.trim()} ${i + 1}` }));
}

/** A saved character. REF includes the armor penalty, as it does on the sheet. */
export function makePc(id: string, character: Character): Combatant {
	const gear = gearOf(character.extra);
	const maxHp = derivedStats(character.stats).hp;
	return {
		id,
		name: character.name,
		characterId: character.id,
		ref: armoredStats(character.stats, gear).REF ?? 0,
		roll: null,
		initiative: null,
		tiebreak: 0,
		hp: clampHp(Number(character.extra.currentHp ?? maxHp), maxHp),
		headMultiplier: headMultiplierOf(character.extra),
		maxHp,
		gear,
		out: false
	};
}

/** REF + 1d10. */
export function rollInitiative(combatant: Combatant, die: Die): Combatant {
	const roll = die();
	return { ...combatant, roll, initiative: combatant.ref + roll, tiebreak: 0 };
}

/** Sort into the queue, re-rolling ties until each is settled. */
export function orderQueue(combatants: readonly Combatant[], die: Die): Combatant[] {
	const groups = new Map<number, Combatant[]>();
	for (const c of combatants) {
		const key = c.initiative ?? Number.NEGATIVE_INFINITY;
		groups.set(key, [...(groups.get(key) ?? []), c]);
	}
	const settled = [...groups.values()].flatMap((group) => settleTie(group, die));
	return settled.sort(
		(a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || b.tiebreak - a.tiebreak
	);
}

/**
 * Settle one initiative value. Only those still tied roll again, so a tie of
 * any size finishes (11 people can't all roll different numbers on a d10), and
 * an order already settled is never reshuffled. `tiebreak` ends up as the rank.
 */
function settleTie(group: Combatant[], die: Die): Combatant[] {
	if (group.length === 1) return group;
	const buckets = new Map<number, Combatant[]>();
	for (const c of group) buckets.set(c.tiebreak, [...(buckets.get(c.tiebreak) ?? []), c]);
	const order = [...buckets.entries()]
		.sort(([a], [b]) => b - a)
		.flatMap(([, tied]) => rollOff(tied, die));
	return order.map((c, i) => ({ ...c, tiebreak: order.length - i }));
}

/** Everyone rolls; higher goes first; anyone who matched rolls off again. */
function rollOff(tied: Combatant[], die: Die): Combatant[] {
	if (tied.length === 1) return tied;
	const byRoll = new Map<number, Combatant[]>();
	for (const c of tied) {
		const roll = die();
		byRoll.set(roll, [...(byRoll.get(roll) ?? []), c]);
	}
	return [...byRoll.entries()].sort(([a], [b]) => b - a).flatMap(([, again]) => rollOff(again, die));
}

/** Roll for anyone without initiative, build the queue and start Round 1. */
export function startEncounter(encounter: Encounter, die: Die): Encounter {
	const rolled = encounter.combatants.map((c) => (c.initiative === null ? rollInitiative(c, die) : c));
	const combatants = orderQueue(rolled, die);
	const first = combatants.find((c) => !c.out);
	if (!first) return encounter;
	return { started: true, round: 1, currentId: first.id, combatants };
}

/** Add someone. Mid-fight they roll in and take their place in the queue. */
export function addCombatants(encounter: Encounter, added: readonly Combatant[], die: Die): Encounter {
	if (!encounter.started) return { ...encounter, combatants: [...encounter.combatants, ...added] };
	const rolled = added.map((c) => (c.initiative === null ? rollInitiative(c, die) : c));
	return { ...encounter, combatants: orderQueue([...encounter.combatants, ...rolled], die) };
}

/** Walk the queue from the current Turn; passing an end changes the Round. */
function step(encounter: Encounter, direction: 1 | -1): Encounter {
	const { combatants, currentId } = encounter;
	const size = combatants.length;
	if (!encounter.started || !combatants.some((c) => !c.out)) return encounter;
	const start = combatants.findIndex((c) => c.id === currentId);
	let index = start;
	let round = encounter.round;
	do {
		index += direction;
		if (index >= size) {
			index = 0;
			round += 1;
		} else if (index < 0) {
			if (round <= 1) return encounter; // nothing before the first Turn
			index = size - 1;
			round -= 1;
		}
	} while (combatants[index].out);
	return { ...encounter, round, currentId: combatants[index].id };
}

export const nextTurn = (encounter: Encounter) => step(encounter, 1);
export const previousTurn = (encounter: Encounter) => step(encounter, -1);

function update(encounter: Encounter, id: string, change: (c: Combatant) => Combatant): Encounter {
	return { ...encounter, combatants: encounter.combatants.map((c) => (c.id === id ? change(c) : c)) };
}

/** Roll for one combatant during setup. */
export function rollFor(encounter: Encounter, id: string, die: Die): Encounter {
	return update(encounter, id, (c) => rollInitiative(c, die));
}

/** Type in an initiative (players rolling their own dice). */
export function setInitiative(encounter: Encounter, id: string, value: number | null): Encounter {
	return update(encounter, id, (c) => ({ ...c, roll: null, initiative: value, tiebreak: 0 }));
}

/** Knock someone out or bring them back. If it's their Turn, play moves on. */
export function setOut(encounter: Encounter, id: string, out: boolean): Encounter {
	const changed = update(encounter, id, (c) => ({ ...c, out }));
	return out && encounter.currentId === id ? nextTurn(changed) : changed;
}

/** Take someone out of the fight entirely. */
export function removeCombatant(encounter: Encounter, id: string): Encounter {
	const moved = encounter.currentId === id ? nextTurn(setOutOnly(encounter, id)) : encounter;
	const combatants = moved.combatants.filter((c) => c.id !== id);
	return {
		...moved,
		combatants,
		currentId: combatants.some((c) => c.id === moved.currentId) ? moved.currentId : null
	};
}

const setOutOnly = (encounter: Encounter, id: string) => update(encounter, id, (c) => ({ ...c, out: true }));

/** Where a hit lands. 'direct' skips armor, like the sheet's option. */
export type HitLocation = ArmorLocation | 'direct';

/** Armor first, then HP, using the same rules as the character sheet. */
export function damage(encounter: Encounter, id: string, amount: number, location: HitLocation): Encounter {
	return update(encounter, id, (c) => {
		if (location === 'direct') return { ...c, hp: clampHp(c.hp - amount, c.maxHp) };
		const result = takeArmoredDamage(c.hp, c.maxHp, c.gear, amount, location, { headMultiplier: c.headMultiplier });
		return { ...c, hp: result.hp, gear: result.gear };
	});
}

export function heal(encounter: Encounter, id: string, amount: number): Encounter {
	return update(encounter, id, (c) => ({ ...c, hp: clampHp(c.hp + amount, c.maxHp) }));
}

export const spOf = (combatant: Combatant) => wornSp(combatant.gear);

/** Read a saved encounter, dropping anything malformed. */
export function parseEncounter(value: unknown): Encounter {
	if (typeof value !== 'object' || value === null) return newEncounter();
	const v = value as Partial<Encounter>;
	if (!Array.isArray(v.combatants) || !v.combatants.every(isCombatant)) return newEncounter();
	// Duplicate ids can't be told apart, and Svelte's keyed list can't render them.
	if (new Set(v.combatants.map((c) => c.id)).size !== v.combatants.length) return newEncounter();
	const started = v.started === true && Number.isInteger(v.round) && (v.round as number) >= 1;
	const current = v.combatants.some((c) => c.id === v.currentId) ? (v.currentId as string) : null;
	if (started && !current) return { ...newEncounter(), combatants: v.combatants };
	return { started, round: started ? (v.round as number) : 0, currentId: current, combatants: v.combatants };
}

function isCombatant(value: unknown): value is Combatant {
	if (typeof value !== 'object' || value === null) return false;
	const c = value as Record<string, unknown>;
	const whole = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
	return (
		typeof c.id === 'string' &&
		typeof c.name === 'string' &&
		whole(c.ref) &&
		whole(c.hp) &&
		whole(c.maxHp) &&
		whole(c.tiebreak) &&
		(c.headMultiplier === undefined || c.headMultiplier === 2 || c.headMultiplier === 3) &&
		(c.initiative === null || whole(c.initiative)) &&
		Array.isArray(c.gear) &&
		c.gear.every(isGear) &&
		typeof c.out === 'boolean'
	);
}

function isGear(value: unknown): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const g = value as Record<string, unknown>;
	if (typeof g.id !== 'string' || typeof g.kind !== 'string') return false;
	return g.kind !== 'armor' || validArmorState(g);
}
