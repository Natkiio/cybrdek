import type { GearItem } from './gear.ts';
import type { InstalledCyberware } from './cyberware.ts';
import { DECK_TYPES, HARDWARE, PROGRAMS, CYBERARM_DECK_BONUS, BODYWEIGHT_HARDWARE_BONUS, type DeckQuality } from './programs.ts';
export interface ProgramCopy { id: string; defId: string; loaded: boolean }
export interface HardwareCopy { id: string; defId: string }
export interface Cyberdeck {
	quality: DeckQuality;
	programs: ProgramCopy[];
	hardware: HardwareCopy[];
	cyberwareId?: string;
	bodyweightSuitId?: string;
}
export const newDeck = (): Cyberdeck => ({ quality: 'standard', programs: [], hardware: [] });
export const deckItems = (gear: readonly GearItem[]) => gear.filter(g => g?.cyberdeck !== undefined && validCyberdeck(g.cyberdeck));
export const isBodyweightSuit = (g: GearItem) => g?.kind === 'armor' && (g.armorType === 'bodyweight-suit' || g.name === 'Bodyweight Suit');

/** Structural validation only: preserve an overloaded loadout so the owner can repair it. */
export function validCyberdeck(value: unknown): value is Cyberdeck {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const d = value as Cyberdeck;
	if (!DECK_TYPES.some(t => t.id === d.quality) || !Array.isArray(d.programs) || !Array.isArray(d.hardware)) return false;
	if ([d.cyberwareId, d.bodyweightSuitId].some(id => id !== undefined && (typeof id !== 'string' || !id))) return false;
	const instances = [...d.programs, ...d.hardware];
	if (instances.some(c => !c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id)) return false;
	if (new Set(instances.map(c => c.id)).size !== instances.length) return false;
	return d.programs.every(c => PROGRAMS.some(p => p.id === c.defId) && typeof c.loaded === 'boolean')
		&& d.hardware.every(c => HARDWARE.some(h => h.id === c.defId));
}
export function slotsOf(item: GearItem, gear: readonly GearItem[], cyberware: readonly InstalledCyberware[]) {
	const d = item.cyberdeck!;
	const warnings: string[] = [];
	const implant = cyberware.find(c => c.id === d.cyberwareId && c.defId === 'cyberdeck');
	const suit = gear.find(g => g.id === d.bodyweightSuitId && isBodyweightSuit(g) && g.equipped !== false);
	const otherLink = (field: 'cyberwareId' | 'bodyweightSuitId') => deckItems(gear).some(g => g.id !== item.id && g.cyberdeck?.[field] !== undefined && g.cyberdeck[field] === d[field]);
	const armBonus = !!implant && !otherLink('cyberwareId');
	const suitBonus = !!suit && !otherLink('bodyweightSuitId');
	if (d.cyberwareId && !armBonus) warnings.push('Cyberdeck implant link is missing or shared with another deck.');
	if (d.bodyweightSuitId && !suitBonus) warnings.push('Bodyweight Suit link is missing, not worn, or shared with another deck.');
	const shared = DECK_TYPES.find(t => t.id === d.quality)!.slots + (armBonus ? CYBERARM_DECK_BONUS : 0);
	const hardwareOnly = suitBonus ? BODYWEIGHT_HARDWARE_BONUS : 0;
	const hardware = d.hardware.reduce((n, c) => n + HARDWARE.find(h => h.id === c.defId)!.slots, 0);
	const programs = d.programs.filter(c => c.loaded).reduce((n, c) => n + PROGRAMS.find(p => p.id === c.defId)!.slots, 0);
	const usedShared = programs + Math.max(0, hardware - hardwareOnly);
	return { shared, hardwareOnly, hardware, programs, free: shared - usedShared,
		overflow: Math.max(0, usedShared - shared), warnings };
}
/** Reject changes that add overflow; unloading/removing still repairs imported or stale loadouts. */
export function deckChangeProblem(item: GearItem, next: Cyberdeck, gear: readonly GearItem[], cyberware: readonly InstalledCyberware[]): string | null {
	if (!validCyberdeck(next)) return 'The deck configuration is invalid.';
	const before = slotsOf(item, gear, cyberware);
	const changed = { ...item, cyberdeck: next };
	const after = slotsOf(changed, gear.map(g => g.id === item.id ? changed : g), cyberware);
	return after.overflow > before.overflow ? 'Not enough deck slots. Unload programs or remove hardware first.' : null;
}
