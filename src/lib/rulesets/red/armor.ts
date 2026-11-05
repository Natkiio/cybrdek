import { ATTACK_RULES, type DamageOptions } from './attacks.ts';
import type { ArmorLocation, GearItem } from './gear.ts';

export function isBodyweightSuit(item: GearItem): boolean {
	return item.kind === 'armor' && (item.armorType === 'bodyweight-suit' || item.name === 'Bodyweight Suit');
}

/** Core p. 350: only one Bodyweight Suit can be worn at once. */
export function equipArmor(gear: GearItem[], id: string, equipped: boolean): GearItem[] {
	const item = gear.find((g) => g.id === id);
	return gear.map((g) => g.id === id ? { ...g, equipped }
		: equipped && item && isBodyweightSuit(item) && isBodyweightSuit(g)
			? { ...g, equipped: false } : g);
}

/** Core pp. 184, 350: Bodyweight Suits protect both locations, separately. */
export function covers(item: GearItem, location: ArmorLocation): boolean {
	return item.kind === 'armor' && (item.location === location || item.location === 'both' ||
		isBodyweightSuit(item));
}

export function currentSp(item: GearItem, location: ArmorLocation): number {
	return Math.max(0, Math.min(item.sp ?? 0, item.currentSp?.[location] ?? item.sp ?? 0));
}

/** Core p. 184: use the highest worn SP, never the sum of layers. */
export function wornSp(gear: GearItem[]): Record<ArmorLocation, number> {
	return Object.fromEntries((['head', 'body'] as const).map((location) => [location,
		Math.max(0, ...gear.filter((g) => g.equipped !== false && covers(g, location))
			.map((g) => currentSp(g, location)))
	])) as Record<ArmorLocation, number>;
}

/** Core pp. 184, 350: worst penalty once, even for armor ablated to SP 0. */
export function armorPenalty(gear: GearItem[]): number {
	return Math.min(0, ...gear.filter((g) => g.kind === 'armor' && g.equipped !== false)
		.map((g) => g.penalty ?? 0));
}

/** Core p. 350: affected STATs have a minimum of zero. Base STATs stay intact. */
export function armoredStats(stats: Record<string, number>, gear: GearItem[]): Record<string, number> {
	const next = { ...stats };
	for (const id of ['REF', 'DEX', 'MOVE']) next[id] = Math.max(0, (stats[id] ?? 0) + armorPenalty(gear));
	return next;
}

/** Core p. 186: only penetrating hits ablate, and every worn layer at that location ablates. */
export function damageThroughArmor(
	gear: GearItem[], damage: number, location: ArmorLocation, options: DamageOptions = {}
) {
	const rule = ATTACK_RULES[options.attackType ?? 'ranged'];
	const worn = wornSp(gear)[location];
	const sp = rule.armor === 'bypass' ? 0 : rule.armor === 'half' ? Math.ceil(worn / 2) : worn;
	const amount = Number.isFinite(damage) ? Math.max(0, Math.round(damage)) : 0;
	const penetrating = Math.max(0, amount - sp);
	return {
		sp,
		penetrating,
		gear: penetrating > 0 && rule.ablation > 0 ? gear.map((g) => g.equipped !== false && covers(g, location)
			? { ...g, currentSp: { ...g.currentSp, [location]: Math.max(0, currentSp(g, location) - rule.ablation) } }
			: g) : gear
	};
}

/** Check armor fields at the import boundary, including older files with no currentSp. */
export function validArmorState(value: Record<string, unknown>): boolean {
	const whole = (n: unknown, min: number, max: number): n is number =>
		typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
	if (typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name.trim()) return false;
	if (!whole(value.sp, 0, 30) || typeof value.location !== 'string' || !['head', 'body', 'both'].includes(value.location)) return false;
	if (value.penalty !== undefined && !whole(value.penalty, -10, 0)) return false;
	if (value.equipped !== undefined && typeof value.equipped !== 'boolean') return false;
	if (value.armorType !== undefined && typeof value.armorType !== 'string') return false;
	if (value.currentSp !== undefined) {
		if (!value.currentSp || typeof value.currentSp !== 'object' || Array.isArray(value.currentSp)) return false;
		for (const [location, sp] of Object.entries(value.currentSp)) {
			if (!['head', 'body'].includes(location) || !whole(sp, 0, value.sp)) return false;
		}
	}
	return true;
}
