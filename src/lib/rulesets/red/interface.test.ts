import { describe, expect, it } from 'vitest';
import { boosterBonus, INTERFACE_ABILITIES, loadedBoosters, netActions } from './interface.ts';
import type { Cyberdeck } from './cyberdeck.ts';

const ability = (id: string) => INTERFACE_ABILITIES.find((a) => a.id === id)!;

describe('NET Actions per Turn (Core p. 197)', () => {
	it.each([
		[1, 2], [3, 2], [4, 3], [6, 3], [7, 4], [9, 4], [10, 5]
	])('Interface %i gives %i', (rank, actions) => expect(netActions(rank)).toBe(actions));

	it('no Interface, no Netrunning', () => {
		expect(netActions(0)).toBe(0);
		expect(netActions(Number.NaN)).toBe(0);
	});
});

describe('Interface abilities', () => {
	it('has the nine abilities; only Scanner is a Meat Action and only Zap deals damage', () => {
		expect(INTERFACE_ABILITIES.map((a) => a.name)).toEqual([
			'Scanner', 'Backdoor', 'Cloak', 'Control', 'Eye-Dee', 'Pathfinder', 'Slide', 'Virus', 'Zap'
		]);
		expect(INTERFACE_ABILITIES.filter((a) => a.meatAction).map((a) => a.id)).toEqual(['scanner']);
		expect(INTERFACE_ABILITIES.filter((a) => a.damage).map((a) => [a.id, a.damage])).toEqual([['zap', { count: 1, sides: 6 }]]);
	});

	it('a running Booster adds its bonus to its own ability only', () => {
		const running = new Set(['worm', 'see-ya']);
		expect(boosterBonus(ability('backdoor'), running)).toBe(2);
		expect(boosterBonus(ability('pathfinder'), running)).toBe(2);
		expect(boosterBonus(ability('cloak'), running)).toBe(0); // Eraser isn't running
		expect(boosterBonus(ability('zap'), running)).toBe(0);
		expect(boosterBonus(ability('backdoor'), new Set())).toBe(0);
	});

	it('lists each loaded Booster once, across decks, ignoring unloaded copies and other programs', () => {
		const decks: Cyberdeck[] = [
			{ quality: 'standard', hardware: [], programs: [
				{ id: '1', defId: 'worm', loaded: true },
				{ id: '2', defId: 'worm', loaded: true },
				{ id: '3', defId: 'eraser', loaded: false },
				{ id: '4', defId: 'sword', loaded: true }
			] },
			{ quality: 'poor', hardware: [], programs: [{ id: '5', defId: 'see-ya', loaded: true }] }
		];
		expect(loadedBoosters(decks)).toEqual(['worm', 'see-ya']);
	});
});
