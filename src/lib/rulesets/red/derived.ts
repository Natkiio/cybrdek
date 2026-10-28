// =============================================================================
// derived.ts: Cyberpunk RED derived STATs (Core p. 79)
// =============================================================================
// "Derived" means worked out from other STATs instead of being chosen.
// The character sheet calls derivedStats() and shows the four results.
//
//   Hit Points (HP)    = 10 + 5 × (BODY and WILL averaged, rounded up)
//   Seriously Wounded  = half of HP, rounded up
//   Death Save         = BODY
//   Humanity (HUM)     = EMP × 10
// =============================================================================

export interface DerivedStats {
	hp: number;
	seriouslyWounded: number;
	deathSave: number;
	humanity: number;
}

/** Hit Points. BODY 6, WILL 5 → average 5.5 → rounds up to 6 → 10 + 30 = 40. */
export function hitPoints(body: number, will: number): number {
	const average = Math.ceil((body + will) / 2);
	return 10 + 5 * average;
}

/** The Seriously Wounded threshold: half of max HP, rounded up. 35 HP → 18. */
export function seriouslyWoundedThreshold(hp: number): number {
	return Math.ceil(hp / 2);
}

/** Death Save target: equal to BODY. */
export function deathSave(body: number): number {
	return body;
}

/** Starting Humanity: 10 per point of EMP. EMP 5 → 50. */
export function humanity(emp: number): number {
	return emp * 10;
}

/** All four derived STATs from a character's STATs ({ BODY: 6, WILL: 5, EMP: 5, ... }). */
export function derivedStats(stats: Record<string, number>): DerivedStats {
	const hp = hitPoints(stats.BODY, stats.WILL);
	return {
		hp,
		seriouslyWounded: seriouslyWoundedThreshold(hp),
		deathSave: deathSave(stats.BODY),
		humanity: humanity(stats.EMP)
	};
}
