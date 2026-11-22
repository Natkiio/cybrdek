import { expect, it } from 'vitest';
import {
	newArchitecture,
	newFloor,
	newEntry,
	architectureProblem,
	ENTRY_TYPES
} from './architecture.ts';
import { BLACK_ICE, DEMONS } from '#lib/rulesets/red/net-security.ts';
it('supports multiple entries per floor and optional DVs without requiring security programs', () => {
	const a = newArchitecture();
	a.floors.push(newFloor('f', 'Entrance'));
	a.floors[0].entries = ENTRY_TYPES.map((type, i) => newEntry(`e${i}`, type));
	expect(architectureProblem(a)).toBeNull();
	a.floors[0].entries[0].dv = 8;
	expect(architectureProblem(a)).toBeNull();
	a.floors[0].entries[0].dv = 1.5;
	expect(architectureProblem(a)).toContain('whole number');
});
it('rejects duplicate instance IDs and mismatched catalog references before saving', () => {
	const a = newArchitecture();
	a.floors = [newFloor('f', 'First')];
	a.floors[0].entries = [newEntry('f', 'black-ice')];
	expect(architectureProblem(a)).not.toBeNull();
	a.floors[0].entries[0].id = 'e';
	a.floors[0].entries[0].refId = 'imp';
	expect(architectureProblem(a)).not.toBeNull();
	for (const def of BLACK_ICE) {
		a.floors[0].entries[0].refId = def.id;
		expect(architectureProblem(a)).toBeNull();
	}
	a.floors[0].entries[0] = newEntry('d', 'demon');
	for (const def of DEMONS) {
		a.floors[0].entries[0].refId = def.id;
		expect(architectureProblem(a)).toBeNull();
	}
});
