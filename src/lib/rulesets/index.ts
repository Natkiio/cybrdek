import type { Ruleset } from '#lib/engine/types.ts';
import { red } from './red/index.ts';

// Every game system the app supports. Cyberpunk RED is the only one for v1.
export const rulesets: Ruleset[] = [red];
