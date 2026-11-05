import { describe, expect, it } from 'vitest';
import { CRITICAL_INJURIES, injuriesOf, injuryModifiers, receiveInjury, validInjuries } from './injuries.ts';

describe('Critical Injuries (Core pp. 187–188)', () => {
 it('covers every 2d6 result for both locations', () => {
  for (const location of ['head', 'body'] as const) {
   expect(Object.keys(CRITICAL_INJURIES[location]).map(Number)).toEqual([2,3,4,5,6,7,8,9,10,11,12]);
  }
  expect(CRITICAL_INJURIES.head[9].name).toBe('Cracked Skull');
  expect(CRITICAL_INJURIES.body[9].name).toBe('Torn Muscle');
 });
 it('defaults legacy characters to no injuries', () => {
  expect(injuriesOf({})).toEqual([]);
 });
 it('deals exactly five direct HP damage at either location and floors at zero', () => {
  for (const location of ['head', 'body'] as const) {
   expect(receiveInjury([], { location, roll: 2 }, 40, 40).currentHp).toBe(35);
   expect(receiveInjury([], { location, roll: 2 }, 3, 40).currentHp).toBe(0);
  }
 });
 it('does not add duplicate injuries or apply their bonus damage twice', () => {
  const first = receiveInjury([], { location: 'body', roll: 7 }, 40, 40);
  expect(receiveInjury(first.criticalInjuries, { location: 'body', roll: 7 }, 35, 40)).toEqual(first);
  expect(receiveInjury(first.criticalInjuries, { location: 'head', roll: 7 }, 35, 40).currentHp).toBe(30);
 });
 it('adds ongoing penalties and restores them when the injury is removed', () => {
  expect(injuryModifiers([{ location: 'head', roll: 3 }, { location: 'head', roll: 5 }, { location: 'body', roll: 4 }, { location: 'head', roll: 9 }]))
   .toEqual({ actions: -4, move: -2, deathSave: 3, headMultiplier: 3 });
  expect(injuryModifiers([])).toEqual({ actions: 0, move: 0, deathSave: 0, headMultiplier: 2 });
 });
 it.each([null, {}, [null], [{ location: 'arm', roll: 2 }], [{ location: 'head', roll: 1 }], [{ location: 'body', roll: 13 }], [{ location: 'head', roll: 2.5 }], [{ location: 'head', roll: '2' }], [{ location: 'head', roll: 2 }, { location: 'head', roll: 2 }]])('rejects invalid state %j', (value) => {
  expect(validInjuries(value)).toBe(false);
 });
});
