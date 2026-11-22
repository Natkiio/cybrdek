import { describe, expect, it } from 'vitest';
import { NET_RULES } from './net-rules.ts';
import { INTERFACE_ABILITIES, netActions } from './interface.ts';

describe('NET rules reference', () => {
	it('every section has an id, pages and something to say', () => {
		expect(new Set(NET_RULES.map((s) => s.id)).size).toBe(NET_RULES.length);
		for (const s of NET_RULES) {
			expect(s.pages).toMatch(/^\d+(–\d+)?(, \d+)*$/);
			expect(s.points.length).toBeGreaterThan(0);
		}
	});

	it('lists every Interface Ability', () => {
		const abilities = NET_RULES.find((s) => s.id === 'abilities')!.points.join('\n');
		for (const a of INTERFACE_ABILITIES) expect(abilities).toContain(`${a.name}:`);
	});

	it('the NET Actions line matches the rules the sheet uses', () => {
		const line = NET_RULES.find((s) => s.id === 'turn')!.points.find((p) => p.startsWith('NET Actions per Turn'))!;
		expect(line).toContain(`1–3 → ${netActions(1)}, 4–6 → ${netActions(4)}, 7–9 → ${netActions(7)}, 10 → ${netActions(10)}`);
	});
});
