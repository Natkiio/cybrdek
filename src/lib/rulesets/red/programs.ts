// Core pp. 196, 202–204, 208. Names/numbers and original summaries only.
// Every rule value awaits Nathan's manual Core Rulebook check in the PR.
// Core pp. 201, 208: preparation time, separate from NET activation/deactivation.
export const DECK_INSTALL_HOURS = 1;
export const DECK_TYPES = [
	{ id: 'poor', name: 'Poor Quality', slots: 5, cost: 100 },
	{ id: 'standard', name: 'Standard', slots: 7, cost: 500 },
	{ id: 'excellent', name: 'Excellent Quality', slots: 9, cost: 1000 }
] as const;
export type DeckQuality = typeof DECK_TYPES[number]['id'];
export interface ProgramDef {
	id: string; name: string; category: 'Booster' | 'Defender' | 'Attacker'; target?: 'Program' | 'Netrunner';
	atk: number; def: number; rez: number; slots: number; cost: number; page: number;
	summary: string; numbers: Readonly<Record<string, number | string>>;
}
const program = (id: string, name: string, category: ProgramDef['category'], atk: number, cost: number,
	summary: string, numbers: ProgramDef['numbers'], target?: ProgramDef['target']): ProgramDef => ({
	id, name, category, atk, def: 0, rez: category === 'Attacker' ? 0 : 7, slots: 1, cost,
	page: category === 'Attacker' && id !== 'banhammer' ? 204 : 203, summary, numbers, ...(target ? { target } : {})
});
export const PROGRAMS: readonly ProgramDef[] = [
	program('eraser', 'Eraser', 'Booster', 0, 20, 'Helps conceal your trail.', { 'Cloak bonus': 2 }),
	program('see-ya', 'See Ya', 'Booster', 0, 20, 'Helps survey the architecture.', { 'Pathfinder bonus': 2 }),
	program('speedy-gonzalvez', 'Speedy Gonzalvez', 'Booster', 0, 100, 'Helps you react in the NET.', { 'Speed bonus': 2 }),
	program('worm', 'Worm', 'Booster', 0, 50, 'Helps defeat passwords.', { 'Backdoor bonus': 2 }),
	program('armor', 'Armor', 'Defender', 0, 50, 'Softens incoming brain damage.', { 'Brain damage reduction': 4, 'Running copies limit': 1, 'Uses per netrun': 1 }),
	program('flak', 'Flak', 'Defender', 0, 50, 'Disrupts ordinary attack programs.', { 'Incoming non-Black ICE ATK': 0, 'Running copies limit': 1, 'Uses per netrun': 1 }),
	program('shield', 'Shield', 'Defender', 0, 20, 'Intercepts an ordinary program hit, then drops.', { 'Brain-damage hits stopped': 1, 'Running copies limit': 1, 'Uses per netrun': 1 }),
	program('banhammer', 'Banhammer', 'Attacker', 1, 50, 'Best against ordinary software.', { 'Non-Black ICE REZ damage': '3d6', 'Black ICE REZ damage': '2d6' }, 'Program'),
	program('sword', 'Sword', 'Attacker', 1, 50, 'Best against Black ICE.', { 'Black ICE REZ damage': '3d6', 'Non-Black ICE REZ damage': '2d6' }, 'Program'),
	program('deckkrash', 'DeckKRASH', 'Attacker', 0, 100, 'Forces a dangerous disconnect.', {}, 'Netrunner'),
	program('hellbolt', 'Hellbolt', 'Attacker', 2, 100, 'Burns the runner and uninsulated equipment.', { 'Brain damage': '2d6', 'Fire HP damage per turn': 2 }, 'Netrunner'),
	program('nervescrub', 'Nervescrub', 'Attacker', 0, 100, 'Temporarily impairs the runner’s physical and mental stats.', { 'INT/REF/DEX reduction': '1d6', 'STAT minimum': 1, 'Duration (hours)': 1 }, 'Netrunner'),
	program('poison-flatline', 'Poison Flatline', 'Attacker', 0, 100, 'Erases a randomly chosen ordinary program.', { 'Programs destroyed': 1 }, 'Netrunner'),
	program('superglue', 'Superglue', 'Attacker', 2, 100, 'Traps the runner until it wears off or they disconnect unsafely.', { 'Duration (rounds)': '1d6', 'Uses per netrun': 1 }, 'Netrunner'),
	program('vrizzbolt', 'Vrizzbolt', 'Attacker', 1, 50, 'Hurts the runner and slows their next NET turn.', { 'Brain damage': '1d6', 'Next-turn NET Actions reduction': 1, 'NET Actions minimum': 2 }, 'Netrunner')
];
export const HARDWARE = [
	{ id: 'backup-drive', name: 'Backup Drive', slots: 2, cost: 100, summary: 'Keeps recoverable copies of destroyed ordinary programs.' },
	{ id: 'dna-lock', name: 'DNA Lock', slots: 2, cost: 100, summary: 'Restricts access using a biometric key.', numbers: { 'Electronics/Security Tech DV': 17 } },
	{ id: 'hardened-circuitry', name: 'Hardened Circuitry', slots: 1, cost: 100, summary: 'Protects the deck from EMP and ordinary program sabotage.' },
	{ id: 'insulated-wiring', name: 'Insulated Wiring', slots: 1, cost: 100, summary: 'Protects against program-caused fires.' },
	{ id: 'krash-barrier', name: 'KRASH Barrier', slots: 2, cost: 100, summary: 'Resists forced disconnection by programs.' },
	{ id: 'range-upgrade', name: 'Range Upgrade', slots: 1, cost: 100, summary: 'Extends the connection distance.', numbers: { 'Access-point range (m)': 8 } }
] as const;
export const CYBERARM_DECK_BONUS = 1; // Core p. 208
export const BODYWEIGHT_HARDWARE_BONUS = 1; // Core p. 208
