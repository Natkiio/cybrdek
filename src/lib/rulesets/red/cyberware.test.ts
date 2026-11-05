import { describe, expect, it } from 'vitest';
import {
	CYBERWARE,
	cyberwareDef,
	cyberwareOf,
	effectiveEmp,
	freePoolSlots,
	freeSlots,
	humanityOf,
	installProblem,
	maxHumanity,
	possibleHosts,
	psychosisLevel,
	regainHumanity,
	removeProblem,
	rollHumanityLoss,
	validCyberware,
	type InstalledCyberware
} from './cyberware.ts';

const def = (id: string) => {
	const d = cyberwareDef(id);
	if (!d) throw new Error(`no ${id}`);
	return d;
};
let n = 0;
const piece = (defId: string, hostId?: string, hl = 7): InstalledCyberware => ({ id: `i${++n}`, defId, hostId, hl });

describe('the table (Core pp. 111–116)', () => {
	it('has unique ids and sensible numbers', () => {
		expect(new Set(CYBERWARE.map((d) => d.id)).size).toBe(CYBERWARE.length);
		for (const d of CYBERWARE) {
			expect(d.hl, d.name).toBeGreaterThanOrEqual(0);
			expect(d.hlDice === 'none', d.name).toBe(d.hl === 0);
			for (const host of d.hosts ?? []) expect(cyberwareDef(host)?.holds, d.name).toBeGreaterThan(0);
			if (d.needs) expect(cyberwareDef(d.needs), d.name).toBeDefined();
		}
	});

	it('preset HL always matches the dice average the book uses', () => {
		const preset: Record<string, number> = { half: 2, '1d6': 3, '2d6': 7, '4d6': 14 };
		for (const d of CYBERWARE) if (d.hlDice !== 'none') expect(d.hl, d.name).toBe(preset[d.hlDice]);
	});

	it.each([
		['neural-link', 5, 500],
		['cybereye', 3, 100],
		['cyberaudio-suite', 3, 500],
		['cyberarm', 4, 500],
		['cyberleg', 3, 100]
	])('%s holds %i and costs %i', (id, holds, cost) => {
		expect(def(id)).toMatchObject({ holds, cost });
		expect(def(id).hosts).toBeUndefined();
	});

	it('spot-checks costs and Humanity Loss', () => {
		expect(def('kerenzikov')).toMatchObject({ hl: 14, hlDice: '4d6', cost: 500 });
		expect(def('implanted-linear-frame-beta')).toMatchObject({ cost: 5000, category: 'borgware' });
		expect(def('radio-scanner-music-player').cost).toBe(50);
		expect(def('realskinn-covering')).toMatchObject({ slots: 0, hl: 0 });
	});
});

describe('rollHumanityLoss', () => {
	const sixes = () => 6;
	it.each([
		['none', 0],
		['half', 3],
		['1d6', 6],
		['2d6', 12],
		['4d6', 24]
	] as const)('%s with all sixes is %i', (dice, total) => {
		expect(rollHumanityLoss(dice, sixes)).toBe(total);
	});

	it('rounds 1d6/2 up', () => {
		expect(rollHumanityLoss('half', () => 1)).toBe(1);
		expect(rollHumanityLoss('half', () => 3)).toBe(2);
	});
});

describe('installProblem', () => {
	it('needs a foundation with room', () => {
		expect(installProblem([], def('kerenzikov'))).toContain('Neural Link');
		const link = piece('neural-link');
		expect(installProblem([link], def('kerenzikov'), [link.id])).toBeNull();
	});

	it('counts multi-slot options', () => {
		const arm = piece('cyberarm');
		const full = [arm, piece('popup-shield', arm.id), piece('grapple-hand', arm.id)]; // 3 + 1 of 4
		expect(freeSlots(full, arm)).toBe(0);
		expect(installProblem(full, def('tool-hand'), [arm.id])).toContain('free slot'); // the arm is full
		expect(installProblem(full, def('tool-hand'))).toBeNull(); // but it can go in a meat arm
	});

	it('refuses a host with no room', () => {
		const eye = piece('cybereye');
		const full = [eye, piece('dartgun', eye.id)];
		expect(installProblem(full, def('chyron'), [eye.id])).toContain('free slot');
	});

	it('needs two hosts for paired options', () => {
		const a = piece('cybereye');
		expect(installProblem([a], def('anti-dazzle'), [a.id])).toContain('two Cybereyes');
		const b = piece('cybereye');
		expect(installProblem([a, b], def('anti-dazzle'), [a.id])).toContain('Choose two');
		expect(installProblem([a, b], def('anti-dazzle'), [a.id, a.id])).toContain('Choose two');
		expect(installProblem([a, b], def('anti-dazzle'), [a.id, b.id])).toBeNull();
	});

	it('allows only one piece of Speedware and one Cyberaudio Suite', () => {
		const link = piece('neural-link');
		const fast = [link, piece('kerenzikov', link.id)];
		expect(installProblem(fast, def('sandevistan'), [link.id])).toContain('Speedware');
		expect(installProblem([piece('cyberaudio-suite')], def('cyberaudio-suite'))).toContain('Only one');
	});

	it('caps Fashionware, Internal and External at 7', () => {
		const seven = Array.from({ length: 7 }, () => piece('biomonitor'));
		expect(freePoolSlots(seven, 'fashionware')).toBe(0);
		expect(installProblem(seven, def('chemskin'))).toContain('7 max');
		expect(installProblem(seven, def('gills'))).toBeNull(); // other pools unaffected
	});

	it('lets meat-limb pieces go in with no host', () => {
		expect(installProblem([], def('rippers'))).toBeNull();
		expect(installProblem([], def('subdermal-grip'))).toContain('Neural Link');
		expect(installProblem([piece('neural-link')], def('subdermal-grip'))).toBeNull();
	});

	it('gives a socket one chip, without using a Neural Link slot', () => {
		const link = piece('neural-link');
		const socket = piece('chipware-socket', link.id);
		const chipped = [link, socket, piece('pain-editor', socket.id)];
		expect(freeSlots(chipped, link)).toBe(4);
		expect(freeSlots(chipped, socket)).toBe(0);
		expect(possibleHosts(chipped, def('skill-chip'))).toEqual([]);
	});

	it('Standard Hand and Foot take no slot, even in a full limb (Codex, #57 review)', () => {
		const arm = piece('cyberarm');
		const hand = piece('standard-hand', arm.id);
		expect(freeSlots([arm, hand], arm)).toBe(4);
		const full = [arm, piece('popup-shield', arm.id), piece('grapple-hand', arm.id)];
		expect(installProblem(full, def('standard-hand'), [arm.id])).toBeNull();
		const leg = piece('cyberleg');
		expect(freeSlots([leg, piece('standard-foot', leg.id)], leg)).toBe(3);
	});

	it('a Sensor Array gives the suite 5 more slots, and only one fits', () => {
		const suite = piece('cyberaudio-suite');
		const array = piece('sensor-array');
		expect(freeSlots([suite], suite)).toBe(3);
		expect(freeSlots([suite, array], suite)).toBe(8);
		expect(installProblem([suite, array], def('sensor-array'))).toContain('Only one');
	});

	it('allows one of each Mount', () => {
		expect(installProblem([piece('multioptic-mount')], def('multioptic-mount'))).toContain('Only one');
		expect(installProblem([piece('artificial-shoulder-mount')], def('artificial-shoulder-mount'))).toContain('Only one');
	});

	it('limits eyes, arms and legs, with Mounts adding more', () => {
		const eyes = [piece('cybereye'), piece('cybereye')];
		expect(installProblem(eyes, def('cybereye'))).toContain('MultiOptic Mount allows more');
		expect(installProblem([...eyes, piece('multioptic-mount')], def('cybereye'))).toBeNull();
		const arms = [piece('cyberarm'), piece('cyberarm')];
		expect(installProblem(arms, def('cyberarm'))).toContain('No room');
		expect(installProblem([...arms, piece('artificial-shoulder-mount')], def('cyberarm'))).toBeNull();
		expect(installProblem([piece('cyberleg'), piece('cyberleg')], def('cyberleg'))).toContain('No room');
	});

	it('Linear Frames need Grafted Muscle and Bone Lace', () => {
		expect(installProblem([], def('implanted-linear-frame-sigma'))).toContain('Grafted Muscle');
		expect(installProblem([piece('grafted-muscle-and-bone-lace')], def('implanted-linear-frame-sigma'))).toBeNull();
	});

	it('coverings take no slot', () => {
		const leg = piece('cyberleg');
		const full = [leg, piece('jump-booster', leg.id), piece('talon-foot', leg.id)];
		expect(freeSlots(full, leg)).toBe(0);
		expect(installProblem(full, def('plastic-covering'), [leg.id])).toBeNull();
	});
});

describe('removeProblem', () => {
	it('keeps foundations until their options are out', () => {
		const eye = piece('cybereye');
		const lens = piece('chyron', eye.id);
		expect(removeProblem([eye, lens], eye)).toContain('1 option');
		expect(removeProblem([eye, lens], lens)).toBeNull();
	});

	it('keeps a Sensor Array while the suite is using its extra slots', () => {
		const suite = piece('cyberaudio-suite');
		const array = piece('sensor-array');
		const three = ['bug-detector', 'level-damper', 'radar-detector'].map((id) => piece(id, suite.id));
		expect(removeProblem([suite, array, ...three], array)).toBeNull();
		const four = [...three, piece('homing-tracer', suite.id)];
		expect(removeProblem([suite, array, ...four], array)).toContain('extra Cyberaudio');
	});

	it('keeps a Mount while extra eyes depend on it', () => {
		const mount = piece('multioptic-mount');
		const eyes = [piece('cybereye'), piece('cybereye'), piece('cybereye')];
		expect(removeProblem([mount, ...eyes], mount)).toContain('extra Cybereyes');
		expect(removeProblem([mount, ...eyes.slice(1)], mount)).toBeNull();
	});

	it('protects something that needs this piece', () => {
		const link = piece('neural-link');
		const grip = piece('subdermal-grip');
		expect(removeProblem([link, grip], link)).toContain('Subdermal Grip');
	});
});

describe('Humanity (Core pp. 79, 229–230)', () => {
	it('EMP is the tens place: 44 → 4, 39 → 3', () => {
		expect(effectiveEmp(5, 44)).toBe(4);
		expect(effectiveEmp(5, 39)).toBe(3);
		expect(effectiveEmp(5, 50)).toBe(5);
		expect(effectiveEmp(5, -4)).toBe(0);
	});

	it('maximum drops 2 per piece, 4 per borgware, 0 for 0-HL pieces', () => {
		expect(maxHumanity(6, [])).toBe(60);
		expect(maxHumanity(6, [piece('neural-link'), piece('biomonitor')])).toBe(58);
		expect(maxHumanity(6, [piece('neural-link'), piece('multioptic-mount')])).toBe(54);
	});

	it('therapy stops at the maximum and never lowers Humanity', () => {
		expect(regainHumanity(40, 7, 44)).toBe(44);
		expect(regainHumanity(40, 2, 44)).toBe(42);
		expect(regainHumanity(50, 7, 44)).toBe(50);
	});

	it.each([
		[3, 35, 'stable'],
		[2, 25, 'borderline'],
		[1, 15, 'dissociative'],
		[0, 5, 'cyberpsychosis'],
		[0, 0, 'cyberpsychosis'],
		[0, -1, 'extreme']
	] as const)('EMP %i, Humanity %i is %s', (emp, humanity, level) => {
		expect(psychosisLevel(emp, humanity)).toBe(level);
	});

	it('older characters start from EMP × 10', () => {
		expect(humanityOf({}, 6)).toBe(60);
		expect(humanityOf({ humanity: 41 }, 6)).toBe(41);
	});
});

describe('saved data', () => {
	it('accepts good data and reads it', () => {
		const link = piece('neural-link');
		const list = [link, piece('kerenzikov', link.id)];
		expect(validCyberware(list)).toBe(true);
		expect(cyberwareOf({ cyberware: list })).toEqual(list);
	});

	it.each([
		['not a list', 'x'],
		['unknown piece', [{ id: 'a', defId: 'nope', hl: 1 }]],
		['duplicate ids', [{ id: 'a', defId: 'biomonitor', hl: 0 }, { id: 'a', defId: 'biomonitor', hl: 0 }]],
		['missing host', [{ id: 'a', defId: 'chyron', hostId: 'gone', hl: 1 }]],
		['self host', [{ id: 'a', defId: 'cybereye', hostId: 'a', hl: 1 }]],
		['bad HL', [{ id: 'a', defId: 'biomonitor', hl: -1 }]],
		['null entry', [null]],
		['a host loop', [{ id: 'a', defId: 'cyberarm', hostId: 'b', hl: 7 }, { id: 'b', defId: 'cyberarm', hostId: 'a', hl: 7 }]],
		['the wrong host type', [{ id: 'a', defId: 'biomonitor', hl: 0 }, { id: 'b', defId: 'kerenzikov', hostId: 'a', hl: 14 }]],
		['an option with no host', [{ id: 'a', defId: 'kerenzikov', hl: 14 }]],
		['an overfull host', [
			{ id: 'a', defId: 'cybereye', hl: 7 },
			{ id: 'b', defId: 'dartgun', hostId: 'a', hl: 2 },
			{ id: 'c', defId: 'chyron', hostId: 'a', hl: 2 }
		]]
	])('rejects %s', (_name, value) => {
		expect(validCyberware(value)).toBe(false);
		expect(cyberwareOf({ cyberware: value })).toEqual([]);
	});
});
