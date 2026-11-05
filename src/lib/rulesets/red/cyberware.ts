// =============================================================================
// cyberware.ts: installing cyberware and Humanity Loss
// =============================================================================
//   Core pp. 110–116 (tables), 358–365 (full listings), 79 and 229–230 (Humanity).
//
//   Humanity starts at EMP × 10. EMP is effectively the tens place of Humanity.
//   At character creation the preset Humanity Loss applies; after that, the
//   dice in brackets do. Therapy regains 2d6 or 4d6, up to a maximum that each
//   piece of cyberware lowers by 2 (borgware by 4; 0-HL pieces don't lower it).
//
//   Slots: a foundational piece holds options (Neural Link 5, Cybereye 3,
//   Cyberaudio Suite 3, Cyberarm 4, Cyberleg 3). Fashionware, Internal and
//   External have no foundation, but only 7 slots' worth each. A Chipware
//   Socket holds one chip, and chips don't use Neural Link slots (p. 359).
//
//   Only names and numbers live here, no book text. Effects stay in the book.
// =============================================================================

export type CyberwareCategory =
	| 'fashionware'
	| 'neuralware'
	| 'cyberoptics'
	| 'cyberaudio'
	| 'internal'
	| 'external'
	| 'cyberlimbs'
	| 'borgware';

export const CYBERWARE_CATEGORY_LABELS: Record<CyberwareCategory, string> = {
	fashionware: 'Fashionware',
	neuralware: 'Neuralware',
	cyberoptics: 'Cyberoptics',
	cyberaudio: 'Cyberaudio',
	internal: 'Internal',
	external: 'External',
	cyberlimbs: 'Cyberlimbs',
	borgware: 'Borgware'
};

/** Dice rolled for Humanity Loss after character creation. */
export type HlDice = 'none' | 'half' | '1d6' | '2d6' | '4d6';

export const HL_DICE_LABELS: Record<HlDice, string> = {
	none: 'none',
	half: '1d6/2',
	'1d6': '1d6',
	'2d6': '2d6',
	'4d6': '4d6'
};

export interface CyberwareDef {
	id: string;
	name: string;
	category: CyberwareCategory;
	install: 'Mall' | 'Clinic' | 'Hospital' | 'N/A';
	cost: number; // eurobucks
	hl: number; // preset Humanity Loss
	hlDice: HlDice;
	/** Foundational pieces: how many Option Slots this holds. */
	holds?: number;
	/** Must go in one of these installed pieces. */
	hosts?: readonly string[];
	/** Slots it uses in its host or category pool (default 1). */
	slots?: number;
	/** Bought twice and fitted to two hosts; Humanity Loss is paid for each. */
	paired?: boolean;
	/** May instead be the only piece of cyberware in a meat limb. */
	meatLimb?: boolean;
	/** Also needs this piece installed somewhere. */
	needs?: string;
	/** Only one of this group can be installed. */
	unique?: string;
}

const slug = (name: string) =>
	name.toLowerCase().replace(/[™®]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Extra = Omit<CyberwareDef, 'id' | 'name' | 'category' | 'install' | 'cost' | 'hl' | 'hlDice'>;

function group(category: CyberwareCategory, defaults: Extra = {}) {
	return (
		name: string,
		install: CyberwareDef['install'],
		cost: number,
		hl: number,
		hlDice: HlDice,
		extra: Extra = {}
	): CyberwareDef => ({ id: slug(name), name, category, install, cost, hl, hlDice, ...defaults, ...extra });
}

const fashion = group('fashionware');
const neural = group('neuralware', { hosts: ['neural-link'] });
const chip = group('neuralware', { hosts: ['chipware-socket'] });
const optic = group('cyberoptics', { hosts: ['cybereye'] });
const audio = group('cyberaudio', { hosts: ['cyberaudio-suite'] });
const internal = group('internal');
const external = group('external');
const arm = group('cyberlimbs', { hosts: ['cyberarm'] });
const leg = group('cyberlimbs', { hosts: ['cyberleg'] });
const limb = group('cyberlimbs', { hosts: ['cyberarm', 'cyberleg'] });
const borg = group('borgware');

/** Core pp. 111–116. */
export const CYBERWARE: readonly CyberwareDef[] = [
	fashion('Biomonitor', 'Mall', 100, 0, 'none'),
	fashion('Chemskin', 'Mall', 100, 0, 'none'),
	fashion('EMP Threading', 'Mall', 10, 0, 'none'),
	fashion('Light Tattoo', 'Mall', 100, 0, 'none'),
	fashion('Shift Tacts', 'Mall', 100, 0, 'none'),
	fashion('Skinwatch', 'Mall', 100, 0, 'none'),
	fashion('Techhair', 'Mall', 100, 0, 'none'),

	neural('Neural Link', 'Clinic', 500, 7, '2d6', { holds: 5, hosts: undefined }),
	neural('Braindance Recorder', 'Clinic', 500, 7, '2d6'),
	neural('Chipware Socket', 'Clinic', 500, 7, '2d6', { holds: 1 }),
	neural('Interface Plugs', 'Clinic', 500, 7, '2d6'),
	neural('Kerenzikov', 'Clinic', 500, 14, '4d6', { unique: 'speedware' }),
	neural('Sandevistan', 'Clinic', 500, 7, '2d6', { unique: 'speedware' }),
	chip('Chemical Analyzer', 'N/A', 500, 3, '1d6'),
	chip('Memory Chip', 'N/A', 10, 0, 'none'),
	chip('Olfactory Boost', 'N/A', 100, 7, '2d6'),
	chip('Pain Editor', 'N/A', 1000, 14, '4d6'),
	chip('Skill Chip', 'N/A', 500, 7, '2d6'),
	chip('Tactile Boost', 'N/A', 100, 7, '2d6'),

	optic('Cybereye', 'Clinic', 100, 7, '2d6', { holds: 3, hosts: undefined }),
	optic('Anti-Dazzle', 'Mall', 100, 2, 'half', { paired: true }),
	optic('Chyron', 'Mall', 100, 2, 'half'),
	optic('Color Shift', 'Mall', 100, 2, 'half'),
	optic('Dartgun', 'Clinic', 500, 2, 'half', { slots: 3 }),
	optic('Image Enhance', 'Mall', 500, 3, '1d6', { paired: true }),
	optic('Low Light / Infrared / UV', 'Mall', 500, 3, '1d6', { paired: true, slots: 2 }),
	optic('MicroOptics', 'Clinic', 100, 2, 'half'),
	optic('MicroVideo', 'Clinic', 500, 2, 'half', { slots: 2 }),
	optic('Radiation Detector', 'Clinic', 1000, 3, '1d6'),
	optic('Targeting Scope', 'Clinic', 500, 3, '1d6'),
	optic('TeleOptics', 'Clinic', 500, 3, '1d6'),
	optic('Virtuality', 'Mall', 100, 2, 'half', { paired: true }),

	audio('Cyberaudio Suite', 'Clinic', 500, 7, '2d6', { holds: 3, hosts: undefined, unique: 'cyberaudio-suite' }),
	audio('Amplified Hearing', 'Mall', 100, 3, '1d6'),
	audio('Audio Recorder', 'Clinic', 100, 2, 'half'),
	audio('Bug Detector', 'Mall', 100, 2, 'half'),
	audio('Homing Tracer', 'Clinic', 100, 2, 'half'),
	audio('Internal Agent', 'Mall', 100, 3, '1d6'),
	audio('Level Damper', 'Mall', 100, 2, 'half'),
	audio('Radio Communicator', 'Mall', 100, 2, 'half'),
	audio('Radio Scanner / Music Player', 'Clinic', 50, 2, 'half'),
	audio('Radar Detector', 'Clinic', 500, 2, 'half'),
	audio('Scrambler / Descrambler', 'Mall', 100, 2, 'half'),
	audio('Voice Stress Analyzer', 'Mall', 100, 3, '1d6'),

	internal('AudioVox', 'Clinic', 500, 3, '1d6'),
	internal('Contraceptive Implant', 'Mall', 10, 0, 'none'),
	internal('Enhanced Antibodies', 'Mall', 500, 2, 'half'),
	internal('Cybersnake', 'Hospital', 1000, 14, '4d6'),
	internal('Gills', 'Hospital', 1000, 7, '2d6'),
	internal('Grafted Muscle and Bone Lace', 'Hospital', 1000, 14, '4d6'),
	internal('Independent Air Supply', 'Hospital', 1000, 2, 'half'),
	internal('Midnight Lady™ Sexual Implant', 'Clinic', 100, 7, '2d6'),
	internal('Mr. Studd™ Sexual Implant', 'Clinic', 100, 7, '2d6'),
	internal('Nasal Filters', 'Clinic', 100, 2, 'half'),
	internal('Radar / Sonar Implant', 'Clinic', 1000, 7, '2d6'),
	internal('Toxin Binders', 'Clinic', 100, 2, 'half'),
	internal('Vampyres', 'Clinic', 500, 14, '4d6'),

	external('Hidden Holster', 'Clinic', 500, 7, '2d6'),
	external('Skin Weave', 'Hospital', 500, 7, '2d6'),
	external('Subdermal Armor', 'Hospital', 1000, 14, '4d6'),
	external('Subdermal Pocket', 'Clinic', 100, 3, '1d6'),

	arm('Cyberarm', 'Hospital', 500, 7, '2d6', { holds: 4, hosts: undefined }),
	arm('Standard Hand', 'Clinic', 100, 2, 'half', { meatLimb: true }),
	arm('Big Knucks', 'Clinic', 100, 3, '1d6', { meatLimb: true }),
	arm('Cyberdeck', 'Clinic', 500, 3, '1d6', { slots: 3 }),
	arm('Grapple Hand', 'Clinic', 100, 3, '1d6'),
	arm('Medscanner', 'Clinic', 500, 7, '2d6', { slots: 2 }),
	arm('Popup Grenade Launcher', 'Clinic', 500, 7, '2d6', { slots: 2 }),
	arm('Popup Melee Weapon', 'Clinic', 500, 7, '2d6', { slots: 2 }),
	arm('Popup Shield', 'Clinic', 500, 7, '2d6', { slots: 3 }),
	arm('Popup Ranged Weapon', 'Clinic', 500, 7, '2d6', { slots: 2 }),
	arm('Quick Change Mount', 'Clinic', 100, 7, '2d6'),
	arm('Rippers', 'Clinic', 500, 3, '1d6', { meatLimb: true }),
	arm('Scratchers', 'Mall', 100, 2, 'half', { meatLimb: true }),
	arm('Shoulder Cam', 'Clinic', 500, 7, '2d6', { slots: 2 }),
	arm('Slice ‘N Dice', 'Clinic', 500, 3, '1d6', { meatLimb: true }),
	arm('Subdermal Grip', 'Clinic', 100, 3, '1d6', { meatLimb: true, needs: 'neural-link' }),
	arm('Techscanner', 'Clinic', 500, 7, '2d6', { slots: 2 }),
	arm('Tool Hand', 'Clinic', 100, 3, '1d6', { meatLimb: true }),
	arm('Wolvers', 'Clinic', 500, 7, '2d6', { meatLimb: true }),

	leg('Cyberleg', 'Hospital', 100, 3, '1d6', { holds: 3, hosts: undefined }),
	leg('Standard Foot', 'Clinic', 100, 2, 'half', { meatLimb: true }),
	leg('Grip Foot', 'Clinic', 500, 3, '1d6', { paired: true }),
	leg('Jump Booster', 'Clinic', 500, 3, '1d6', { paired: true, slots: 2 }),
	leg('Skate Foot', 'Clinic', 500, 3, '1d6', { paired: true }),
	leg('Talon Foot', 'Clinic', 500, 3, '1d6', { meatLimb: true }),
	leg('Web Foot', 'Clinic', 500, 3, '1d6', { paired: true }),
	limb('Hardened Shielding', 'Clinic', 1000, 3, '1d6'),
	limb('Plastic Covering', 'Mall', 100, 0, 'none', { slots: 0 }),
	limb('Realskinn™ Covering', 'Mall', 500, 0, 'none', { slots: 0 }),
	limb('Superchrome® Covering', 'Mall', 1000, 0, 'none', { slots: 0 }),

	borg('Artificial Shoulder Mount', 'Hospital', 1000, 14, '4d6'),
	borg('Implanted Linear Frame ß (Beta)', 'Hospital', 5000, 14, '4d6'),
	borg('Implanted Linear Frame ∑ (Sigma)', 'Hospital', 1000, 14, '4d6'),
	borg('MultiOptic Mount', 'Hospital', 1000, 14, '4d6'),
	borg('Sensor Array', 'Clinic', 1000, 14, '4d6', { needs: 'cyberaudio-suite' })
];

const DEFS = new Map(CYBERWARE.map((d) => [d.id, d]));
export const cyberwareDef = (id: string) => DEFS.get(id);

/** Category pools with no foundation: 7 Option Slots' worth each. */
const POOL_SLOTS = 7;
const POOLED: readonly CyberwareCategory[] = ['fashionware', 'internal', 'external'];

/** One installed piece, saved in `extra.cyberware`. */
export interface InstalledCyberware {
	id: string;
	defId: string;
	hostId?: string; // the installed foundation it sits in
	hl: number; // Humanity actually lost for this piece
}

export const slotsUsedBy = (def: CyberwareDef) => def.slots ?? 1;

/** Roll Humanity Loss. 1d6/2 rounds up. `d6` is passed in so tests are exact. */
export function rollHumanityLoss(dice: HlDice, d6: () => number): number {
	const sum = (n: number) => Array.from({ length: n }, d6).reduce((a, b) => a + b, 0);
	if (dice === 'none') return 0;
	if (dice === 'half') return Math.ceil(d6() / 2);
	return sum(Number(dice[0]));
}

/** Slots free in an installed foundation. */
export function freeSlots(installed: readonly InstalledCyberware[], host: InstalledCyberware): number {
	const holds = cyberwareDef(host.defId)?.holds ?? 0;
	const used = installed
		.filter((i) => i.hostId === host.id)
		.reduce((n, i) => n + slotsUsedBy(cyberwareDef(i.defId) as CyberwareDef), 0);
	return holds - used;
}

/** Slots free in a foundation-less category. */
export function freePoolSlots(installed: readonly InstalledCyberware[], category: CyberwareCategory): number {
	const used = installed
		.map((i) => cyberwareDef(i.defId))
		.filter((d) => d?.category === category)
		.reduce((n, d) => n + slotsUsedBy(d as CyberwareDef), 0);
	return POOL_SLOTS - used;
}

/** Installed pieces this could go in, with room for it. */
export function possibleHosts(installed: readonly InstalledCyberware[], def: CyberwareDef): InstalledCyberware[] {
	if (!def.hosts) return [];
	return installed.filter(
		(i) => def.hosts?.includes(i.defId) && freeSlots(installed, i) >= slotsUsedBy(def)
	);
}

/** Why this can't go in right now, or null if it can. */
export function installProblem(
	installed: readonly InstalledCyberware[],
	def: CyberwareDef,
	hostIds: readonly string[] = []
): string | null {
	const has = (id: string) => installed.some((i) => i.defId === id);
	if (def.unique && installed.some((i) => cyberwareDef(i.defId)?.unique === def.unique)) {
		return def.unique === 'speedware' ? 'Only 1 piece of Speedware can be installed.' : `Only one ${def.name} can be installed.`;
	}
	if (def.needs && !has(def.needs)) return `Needs ${cyberwareDef(def.needs)?.name} first.`;
	if (POOLED.includes(def.category) && freePoolSlots(installed, def.category) < slotsUsedBy(def)) {
		return `No ${CYBERWARE_CATEGORY_LABELS[def.category]} slots left (7 max).`;
	}
	if (!def.hosts) return null;
	if (def.meatLimb && hostIds.length === 0) return null; // goes in a meat limb

	const needed = def.paired ? 2 : 1;
	const hostNames = def.hosts.map((h) => cyberwareDef(h)?.name).join(' or ');
	const hosts = possibleHosts(installed, def);
	if (hosts.length < needed) {
		const wanted = def.paired ? `two ${hostNames}s` : `a ${hostNames}`;
		return `Needs ${wanted} with ${slotsUsedBy(def)} free ${slotsUsedBy(def) === 1 ? 'slot' : 'slots'}.`;
	}
	if (hostIds.length !== needed || new Set(hostIds).size !== needed) {
		return def.paired ? `Choose two different ${hostNames}s.` : `Choose a ${hostNames}.`;
	}
	if (!hostIds.every((id) => hosts.some((h) => h.id === id))) return `Choose a ${hostNames} with room.`;
	return null;
}

/** Why this can't come out yet: options must be removed from a foundation first. */
export function removeProblem(installed: readonly InstalledCyberware[], piece: InstalledCyberware): string | null {
	const inside = installed.filter((i) => i.hostId === piece.id).length;
	if (inside) return `Remove the ${inside} ${inside === 1 ? 'option' : 'options'} inside it first.`;
	const def = cyberwareDef(piece.defId);
	const dependent = installed.find((i) => i.id !== piece.id && cyberwareDef(i.defId)?.needs === piece.defId);
	const lastOfKind = installed.filter((i) => i.defId === piece.defId).length === 1;
	if (dependent && lastOfKind) return `${cyberwareDef(dependent.defId)?.name} needs ${def?.name}.`;
	return null;
}

/** Each piece lowers maximum Humanity by 2, borgware by 4, 0-HL pieces by 0. */
export function maxHumanity(emp: number, installed: readonly InstalledCyberware[]): number {
	return (
		emp * 10 -
		installed.reduce((sum, piece) => {
			const def = cyberwareDef(piece.defId);
			if (!def || def.hl === 0) return sum;
			return sum + (def.category === 'borgware' ? 4 : 2);
		}, 0)
	);
}

/** EMP is effectively the tens place of Humanity, never above its starting value. */
export function effectiveEmp(baseEmp: number, humanity: number): number {
	return Math.max(0, Math.min(baseEmp, Math.floor(humanity / 10)));
}

/** Therapy regains Humanity, up to the maximum. Never lowers it. */
export function regainHumanity(humanity: number, amount: number, maximum: number): number {
	return Math.max(humanity, Math.min(maximum, humanity + amount));
}

export type PsychosisLevel = 'stable' | 'borderline' | 'dissociative' | 'cyberpsychosis' | 'extreme';

/** Core p. 230: thresholds by EMP. Negative Humanity hands the character to the GM. */
export function psychosisLevel(emp: number, humanity: number): PsychosisLevel {
	if (humanity < 0) return 'extreme';
	if (emp >= 3) return 'stable';
	return emp === 2 ? 'borderline' : emp === 1 ? 'dissociative' : 'cyberpsychosis';
}

export const PSYCHOSIS_LABELS: Record<PsychosisLevel, string> = {
	stable: '',
	borderline: 'Borderline dissociative disorder: roleplay it.',
	dissociative: 'Dissociative disorder, borderline cyberpsychosis: at least 3 psychopathy traits (Core p. 230).',
	cyberpsychosis: 'Cyberpsychosis: at least 5 psychopathy traits (Core p. 230).',
	extreme: 'Extreme cyberpsychosis: the GM plays this character until Humanity is positive again.'
};

/** Read saved cyberware safely from a character's free-form `extra`. */
export function cyberwareOf(extra: Record<string, unknown>): InstalledCyberware[] {
	return validCyberware(extra.cyberware) ? extra.cyberware : [];
}

/** Current Humanity: saved, or the starting EMP × 10 for older characters. */
export function humanityOf(extra: Record<string, unknown>, emp: number): number {
	return Number.isInteger(extra.humanity) ? (extra.humanity as number) : emp * 10;
}

/** Check saved cyberware: known pieces, unique ids, hosts that exist. */
export function validCyberware(value: unknown): value is InstalledCyberware[] {
	if (!Array.isArray(value)) return false;
	const ids = new Set(value.map((i) => i?.id));
	if (ids.size !== value.length) return false;
	return value.every(
		(i) =>
			typeof i === 'object' &&
			i !== null &&
			typeof i.id === 'string' &&
			DEFS.has(i.defId) &&
			Number.isInteger(i.hl) &&
			i.hl >= 0 &&
			(i.hostId === undefined || (i.hostId !== i.id && ids.has(i.hostId)))
	);
}
