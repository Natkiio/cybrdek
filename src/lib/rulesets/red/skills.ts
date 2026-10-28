import type { SkillDef } from '#lib/engine/types.ts';

// Every Cyberpunk RED core skill: linked STAT, category, (x2) cost and Basic status.
// Names and structure only. No rulebook text.

export const skillCategories = [
	'Awareness',
	'Body',
	'Control',
	'Education',
	'Fighting',
	'Performance',
	'Ranged Weapon',
	'Social',
	'Technique'
];

// Small helper so each skill fits on one line.
// x2 = costs double to improve. basic = every character starts with it at 2+.
// specialised = needs a choice when taken (which language, which instrument...).
function skill(
	id: string,
	name: string,
	stat: string,
	category: string,
	opts: { x2?: boolean; basic?: boolean; specialised?: boolean } = {}
): SkillDef {
	return {
		id,
		name,
		stat,
		category,
		costMultiplier: opts.x2 ? 2 : 1,
		basic: opts.basic ?? false,
		...(opts.specialised ? { specialised: true } : {})
	};
}

export const skills: SkillDef[] = [
	// Awareness
	skill('concentration', 'Concentration', 'WILL', 'Awareness', { basic: true }),
	skill('conceal-reveal-object', 'Conceal/Reveal Object', 'INT', 'Awareness'),
	skill('lip-reading', 'Lip Reading', 'INT', 'Awareness'),
	skill('perception', 'Perception', 'INT', 'Awareness', { basic: true }),
	skill('tracking', 'Tracking', 'INT', 'Awareness'),

	// Body
	skill('athletics', 'Athletics', 'DEX', 'Body', { basic: true }),
	skill('contortionist', 'Contortionist', 'DEX', 'Body'),
	skill('dance', 'Dance', 'DEX', 'Body'),
	skill('endurance', 'Endurance', 'WILL', 'Body'),
	skill('resist-torture-drugs', 'Resist Torture/Drugs', 'WILL', 'Body'),
	skill('stealth', 'Stealth', 'DEX', 'Body', { basic: true }),

	// Control
	skill('drive-land-vehicle', 'Drive Land Vehicle', 'REF', 'Control'),
	skill('pilot-air-vehicle', 'Pilot Air Vehicle', 'REF', 'Control', { x2: true }),
	skill('pilot-sea-vehicle', 'Pilot Sea Vehicle', 'REF', 'Control'),
	skill('riding', 'Riding', 'REF', 'Control'),

	// Education
	skill('accounting', 'Accounting', 'INT', 'Education'),
	skill('animal-handling', 'Animal Handling', 'INT', 'Education'),
	skill('bureaucracy', 'Bureaucracy', 'INT', 'Education'),
	skill('business', 'Business', 'INT', 'Education'),
	skill('composition', 'Composition', 'INT', 'Education'),
	skill('criminology', 'Criminology', 'INT', 'Education'),
	skill('cryptography', 'Cryptography', 'INT', 'Education'),
	skill('deduction', 'Deduction', 'INT', 'Education'),
	skill('education', 'Education', 'INT', 'Education', { basic: true }),
	skill('gamble', 'Gamble', 'INT', 'Education'),
	skill('language', 'Language', 'INT', 'Education', { basic: true, specialised: true }),
	skill('library-search', 'Library Search', 'INT', 'Education'),
	skill('local-expert', 'Local Expert', 'INT', 'Education', { basic: true, specialised: true }),
	skill('science', 'Science', 'INT', 'Education', { specialised: true }),
	skill('tactics', 'Tactics', 'INT', 'Education'),
	skill('wilderness-survival', 'Wilderness Survival', 'INT', 'Education'),

	// Fighting
	skill('brawling', 'Brawling', 'DEX', 'Fighting', { basic: true }),
	skill('evasion', 'Evasion', 'DEX', 'Fighting', { basic: true }),
	skill('martial-arts', 'Martial Arts', 'DEX', 'Fighting', { x2: true, specialised: true }),
	skill('melee-weapon', 'Melee Weapon', 'DEX', 'Fighting'),

	// Performance
	skill('acting', 'Acting', 'COOL', 'Performance'),
	skill('play-instrument', 'Play Instrument', 'TECH', 'Performance', { specialised: true }),

	// Ranged Weapon
	skill('archery', 'Archery', 'REF', 'Ranged Weapon'),
	skill('autofire', 'Autofire', 'REF', 'Ranged Weapon', { x2: true }),
	skill('handgun', 'Handgun', 'REF', 'Ranged Weapon'),
	skill('heavy-weapons', 'Heavy Weapons', 'REF', 'Ranged Weapon', { x2: true }),
	skill('shoulder-arms', 'Shoulder Arms', 'REF', 'Ranged Weapon'),

	// Social
	skill('bribery', 'Bribery', 'COOL', 'Social'),
	skill('conversation', 'Conversation', 'EMP', 'Social', { basic: true }),
	skill('human-perception', 'Human Perception', 'EMP', 'Social', { basic: true }),
	skill('interrogation', 'Interrogation', 'COOL', 'Social'),
	skill('persuasion', 'Persuasion', 'COOL', 'Social', { basic: true }),
	skill('personal-grooming', 'Personal Grooming', 'COOL', 'Social'),
	skill('streetwise', 'Streetwise', 'COOL', 'Social'),
	skill('trading', 'Trading', 'COOL', 'Social'),
	skill('wardrobe-style', 'Wardrobe & Style', 'COOL', 'Social'),

	// Technique
	skill('air-vehicle-tech', 'Air Vehicle Tech', 'TECH', 'Technique'),
	skill('basic-tech', 'Basic Tech', 'TECH', 'Technique'),
	skill('cybertech', 'Cybertech', 'TECH', 'Technique'),
	skill('demolitions', 'Demolitions', 'TECH', 'Technique', { x2: true }),
	skill('electronics-security-tech', 'Electronics/Security Tech', 'TECH', 'Technique', { x2: true }),
	skill('first-aid', 'First Aid', 'TECH', 'Technique', { basic: true }),
	skill('forgery', 'Forgery', 'TECH', 'Technique'),
	skill('land-vehicle-tech', 'Land Vehicle Tech', 'TECH', 'Technique'),
	skill('paint-draw-sculpt', 'Paint/Draw/Sculpt', 'TECH', 'Technique'),
	skill('paramedic', 'Paramedic', 'TECH', 'Technique', { x2: true }),
	skill('photography-film', 'Photography/Film', 'TECH', 'Technique'),
	skill('pick-lock', 'Pick Lock', 'TECH', 'Technique'),
	skill('pick-pocket', 'Pick Pocket', 'TECH', 'Technique'),
	skill('sea-vehicle-tech', 'Sea Vehicle Tech', 'TECH', 'Technique'),
	skill('weaponstech', 'Weaponstech', 'TECH', 'Technique')
];
