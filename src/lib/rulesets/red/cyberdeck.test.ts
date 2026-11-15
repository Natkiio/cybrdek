import { describe, expect, it } from 'vitest';
import { newDeck, slotsOf, deckChangeProblem, validCyberdeck } from './cyberdeck.ts';
import { DECK_TYPES, PROGRAMS, HARDWARE } from './programs.ts';
import type { GearItem } from './gear.ts';
import { exportCharacter, parseCharacterFile } from '#lib/storage/backup.ts';
const item = (): GearItem => ({ id: 'deck', kind: 'item', name: 'Deck', cyberdeck: newDeck() });
const copies = (n: number, loaded = true) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, defId: 'sword', loaded }));
const suit: GearItem = { id: 'suit', kind: 'armor', name: 'Bodyweight Suit', armorType: 'bodyweight-suit', location: 'both', sp: 11 };
const arm = [{ id: 'implant', defId: 'cyberdeck', hl: 3 }];
describe('cyberdeck loadouts', () => {
 it('counts programs and multi-slot hardware together; rejects overfilling and downsizing without losing copies', () => {
  const d = item(); d.cyberdeck!.programs = copies(5); d.cyberdeck!.hardware = [{ id: 'h', defId: 'backup-drive' }];
  expect(slotsOf(d,[d],[])).toMatchObject({ shared: 7, free: 0, programs: 5, hardware: 2 });
  expect(deckChangeProblem(d,{ ...d.cyberdeck!, programs: copies(6) },[d],[])).toContain('Not enough');
  expect(deckChangeProblem(d,{ ...d.cyberdeck!, quality: 'poor' },[d],[])).toContain('Not enough');
  expect(d.cyberdeck!.programs).toHaveLength(5);
 });
 it('counts only loaded copies and keeps distinct copies of the same program', () => {
  const d = item(); d.cyberdeck!.programs = [...copies(7), { id: 'spare', defId: 'sword', loaded: false }];
  expect(validCyberdeck(d.cyberdeck)).toBe(true); expect(slotsOf(d,[d],[]).free).toBe(0);
  expect(deckChangeProblem(d,{ ...d.cyberdeck!, programs: d.cyberdeck!.programs.map(c => c.id === 'spare' ? { ...c, loaded: true } : c) },[d],[])).toContain('Not enough');
 });
 it('a suit slot cannot hold a program; an implant adds a shared slot', () => {
  const d = item(); d.cyberdeck!.bodyweightSuitId = suit.id; d.cyberdeck!.programs = copies(7);
  expect(slotsOf(d,[d,suit],[])).toMatchObject({ free: 0, shared: 7, hardwareOnly: 1 });
  expect(deckChangeProblem(d,{ ...d.cyberdeck!, programs: copies(8) },[d,suit],[])).toContain('Not enough');
  d.cyberdeck!.hardware = [{ id: 'h', defId: 'insulated-wiring' }];
  expect(slotsOf(d,[d,suit],[]).free).toBe(0);
  d.cyberdeck!.cyberwareId = 'implant'; expect(slotsOf(d,[d,suit],arm)).toMatchObject({ shared: 8, free: 1 });
 });
 it('missing or unequipped links remove bonuses but preserve data and permit stepwise repairs', () => {
  const d = item(); d.cyberdeck!.cyberwareId = 'implant'; d.cyberdeck!.bodyweightSuitId = 'suit'; d.cyberdeck!.programs = copies(10);
  expect(slotsOf(d,[d,{ ...suit, equipped: false }],[])).toMatchObject({ shared: 7, hardwareOnly: 0, overflow: 3 });
  expect(slotsOf(d,[d],[]).warnings).toHaveLength(2);
  expect(deckChangeProblem(d,{ ...d.cyberdeck!, programs: copies(9) },[d],[])).toBeNull();
  expect(d.cyberdeck!.programs).toHaveLength(10);
 });
 it('does not count one implant or suit twice across deck entries', () => {
  const d = item(); d.cyberdeck!.cyberwareId = 'implant'; d.cyberdeck!.bodyweightSuitId = 'suit';
  const other = { ...d, id: 'other' };
  expect(slotsOf(d,[d,other,suit],arm)).toMatchObject({ shared: 7, hardwareOnly: 0 });
  expect(slotsOf(d,[d,other,suit],arm).warnings).toHaveLength(2);
 });
 it('rejects malformed loadouts, unknown definitions and duplicate instance IDs', () => {
  for (const value of [null, [], {}, { ...newDeck(), quality: 'magic' }, { ...newDeck(), hardware: [null] },
   { ...newDeck(), programs: [{ id: 'a', defId: 'sword', loaded: 'yes' }] },
   { ...newDeck(), hardware: [{ id: 'a', defId: 'unknown' }] },
   { ...newDeck(), programs: copies(1), hardware: [{ id: 'p0', defId: 'dna-lock' }] }]) expect(validCyberdeck(value)).toBe(false);
 });
 it('has distinct, complete catalog IDs and resolves every hardware/program copy', () => {
  expect(new Set(PROGRAMS.map(p => p.id)).size).toBe(PROGRAMS.length);
  expect(new Set(HARDWARE.map(p => p.id)).size).toBe(HARDWARE.length);
  for (const p of PROGRAMS) { expect(validCyberdeck({ ...newDeck(), programs: [{ id: 'p', defId: p.id, loaded: true }] })).toBe(true); expect(p.summary).not.toBe(''); }
  for (const h of HARDWARE) expect(validCyberdeck({ ...newDeck(), hardware: [{ id: 'h', defId: h.id }] })).toBe(true);
  expect(DECK_TYPES.map(t => t.slots)).toEqual([5,7,9]);
 });
});
const character = () => ({ id: 'runner', name: 'Runner', rulesetId: 'cyberpunk-red', stats: Object.fromEntries(['INT','REF','DEX','TECH','COOL','WILL','LUCK','MOVE','BODY','EMP'].map(s => [s,6])), skills: {}, extra: { gear: [item()], privateNote: 'retain' } });
describe('backups and cloud character validation', () => {
 it('round-trips inventory, IDs and unknown extra fields, including unloaded copies and missing links', () => {
  const c = character(); c.extra.gear[0].cyberdeck!.programs = copies(10); c.extra.gear[0].cyberdeck!.cyberwareId = 'removed';
  expect(parseCharacterFile(exportCharacter(c))).toEqual({ ok: true, character: c });
 });
 it('keeps old characters valid and rejects malformed deck payloads', () => {
  const c = character(); delete c.extra.gear[0].cyberdeck;
  expect(parseCharacterFile(exportCharacter(c)).ok).toBe(true);
  const text = JSON.parse(exportCharacter(character())); text.character.extra.gear[0].cyberdeck.programs = [{ id: 'x', defId: 'unknown', loaded: true }];
  expect(parseCharacterFile(JSON.stringify(text)).ok).toBe(false);
  const grouped = JSON.parse(exportCharacter(character())); grouped.character.extra.gear[0].quantity = 2;
  expect(parseCharacterFile(JSON.stringify(grouped)).ok).toBe(false);
 });
});
