// =============================================================================
// gear.ts: Cyberpunk RED gear, weapons and armor (Core p. 91, 92, 97)
// =============================================================================
// A character's gear lives in `character.extra.gear` as a list of GearItems.
// Weapon and armor "types" are presets: picking one fills in the numbers, and
// the player can still rename it ("Militech Avenger") or tweak anything.
// =============================================================================

export type GearKind = 'weapon' | 'armor' | 'item';
export type ArmorLocation = 'head' | 'body';

export interface GearItem {
	id: string;
	kind: GearKind;
	name: string;
	notes?: string;
	quantity?: number; // items
	// weapons
	weaponType?: string; // WeaponType id
	skill?: string; // skill id used to attack, e.g. 'handgun'
	damage?: string; // dice like '3d6'
	rof?: number; // rate of fire: attacks per Action
	magazine?: number; // max rounds (ranged only)
	ammo?: number; // rounds loaded now
	// armor
	sp?: number; // Stopping Power
	location?: ArmorLocation;
	penalty?: number; // to REF, DEX and MOVE (negative or 0)
}

export interface WeaponType {
	id: string;
	name: string;
	skill: string;
	damage: string;
	rof: number;
	magazine?: number; // undefined for melee and bows
	hands: 1 | 2 | 'varies';
	concealable: boolean;
}

/** Core p. 91 (melee) and p. 92 (ranged): standard weapon types. */
export const WEAPON_TYPES: WeaponType[] = [
	{ id: 'light-melee', name: 'Light Melee Weapon', skill: 'melee-weapon', damage: '1d6', rof: 2, hands: 'varies', concealable: true },
	{ id: 'medium-melee', name: 'Medium Melee Weapon', skill: 'melee-weapon', damage: '2d6', rof: 2, hands: 'varies', concealable: false },
	{ id: 'heavy-melee', name: 'Heavy Melee Weapon', skill: 'melee-weapon', damage: '3d6', rof: 2, hands: 'varies', concealable: false },
	{ id: 'very-heavy-melee', name: 'Very Heavy Melee Weapon', skill: 'melee-weapon', damage: '4d6', rof: 1, hands: 'varies', concealable: false },
	{ id: 'medium-pistol', name: 'Medium Pistol', skill: 'handgun', damage: '2d6', rof: 2, magazine: 12, hands: 1, concealable: true },
	{ id: 'heavy-pistol', name: 'Heavy Pistol', skill: 'handgun', damage: '3d6', rof: 2, magazine: 8, hands: 1, concealable: true },
	{ id: 'very-heavy-pistol', name: 'Very Heavy Pistol', skill: 'handgun', damage: '4d6', rof: 1, magazine: 8, hands: 1, concealable: false },
	{ id: 'smg', name: 'SMG', skill: 'handgun', damage: '2d6', rof: 1, magazine: 30, hands: 1, concealable: true },
	{ id: 'heavy-smg', name: 'Heavy SMG', skill: 'handgun', damage: '3d6', rof: 1, magazine: 40, hands: 1, concealable: false },
	{ id: 'shotgun', name: 'Shotgun', skill: 'shoulder-arms', damage: '5d6', rof: 1, magazine: 4, hands: 2, concealable: false },
	{ id: 'assault-rifle', name: 'Assault Rifle', skill: 'shoulder-arms', damage: '5d6', rof: 1, magazine: 25, hands: 2, concealable: false },
	{ id: 'sniper-rifle', name: 'Sniper Rifle', skill: 'shoulder-arms', damage: '5d6', rof: 1, magazine: 4, hands: 2, concealable: false },
	{ id: 'bow', name: 'Bow / Crossbow', skill: 'archery', damage: '4d6', rof: 1, hands: 2, concealable: false },
	{ id: 'grenade-launcher', name: 'Grenade Launcher', skill: 'heavy-weapons', damage: '6d6', rof: 1, magazine: 2, hands: 2, concealable: false },
	{ id: 'rocket-launcher', name: 'Rocket Launcher', skill: 'heavy-weapons', damage: '8d6', rof: 1, magazine: 1, hands: 2, concealable: false }
];

export interface ArmorType {
	id: string;
	name: string;
	sp: number;
	penalty: number;
}

/** Core p. 97: armor types. Penalty applies to REF, DEX and MOVE. */
export const ARMOR_TYPES: ArmorType[] = [
	{ id: 'leathers', name: 'Leathers', sp: 4, penalty: 0 },
	{ id: 'kevlar', name: 'Kevlar', sp: 7, penalty: 0 },
	{ id: 'light-armorjack', name: 'Light Armorjack', sp: 11, penalty: 0 },
	{ id: 'bodyweight-suit', name: 'Bodyweight Suit', sp: 11, penalty: 0 },
	{ id: 'medium-armorjack', name: 'Medium Armorjack', sp: 12, penalty: -2 },
	{ id: 'heavy-armorjack', name: 'Heavy Armorjack', sp: 13, penalty: -2 },
	{ id: 'flak', name: 'Flak', sp: 15, penalty: -4 },
	{ id: 'metalgear', name: 'Metalgear', sp: 18, penalty: -4 }
];

/** A new weapon from a preset type. */
export function weaponFromType(type: WeaponType, id: string, name = type.name): GearItem {
	return {
		id,
		kind: 'weapon',
		name,
		weaponType: type.id,
		skill: type.skill,
		damage: type.damage,
		rof: type.rof,
		...(type.magazine ? { magazine: type.magazine, ammo: type.magazine } : {})
	};
}

/** New armor from a preset type. */
export function armorFromType(type: ArmorType, id: string, location: ArmorLocation): GearItem {
	return { id, kind: 'armor', name: type.name, sp: type.sp, penalty: type.penalty, location };
}

/** Simple damage dice like '3d6' or '1d10'. Returns null if it isn't NdM. */
export function parseDamage(dice: string): { count: number; sides: number } | null {
	const match = /^\s*(\d{1,2})?\s*d\s*(\d{1,3})\s*$/i.exec(dice);
	if (!match) return null;
	const count = Number(match[1] ?? 1);
	const sides = Number(match[2]);
	if (count < 1 || count > 20 || sides < 2) return null;
	return { count, sides };
}

/**
 * Cyberpunk RED damage crit: two or more 6s on the damage dice cause a Critical
 * Injury and +5 bonus damage (Core p. 187).
 */
export function isDamageCrit(rolls: number[]): boolean {
	return rolls.filter((r) => r === 6).length >= 2;
}

/** Problems with a gear item, in plain words. Empty = valid. */
export function validateGear(item: GearItem): string[] {
	const problems: string[] = [];
	if (!item.name.trim()) problems.push('Give it a name.');
	if (item.kind === 'weapon') {
		if (!item.damage || !parseDamage(item.damage)) problems.push('Damage must be dice like 3d6.');
		if (!item.rof || item.rof < 1) problems.push('ROF must be at least 1.');
		if (item.magazine !== undefined && item.magazine < 1) problems.push('Magazine must be at least 1.');
	}
	if (item.kind === 'armor' && (item.sp === undefined || item.sp < 0 || item.sp > 30)) {
		problems.push('SP must be 0–30.');
	}
	if (item.kind === 'item' && item.quantity !== undefined && item.quantity < 0) {
		problems.push("Quantity can't be negative.");
	}
	return problems;
}

/** Best SP worn on each location (only the highest layer counts). */
export function wornSp(gear: GearItem[]): Record<ArmorLocation, number> {
	const best = { head: 0, body: 0 };
	for (const g of gear) {
		if (g.kind === 'armor' && g.location && (g.sp ?? 0) > best[g.location]) best[g.location] = g.sp ?? 0;
	}
	return best;
}

/** Read gear safely from a character's free-form `extra`. */
export function gearOf(extra: Record<string, unknown>): GearItem[] {
	return Array.isArray(extra.gear) ? (extra.gear as GearItem[]) : [];
}
