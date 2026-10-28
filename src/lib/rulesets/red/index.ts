import type { Ruleset } from '#lib/engine/types.ts';
import { roles } from './roles.ts';
import { skillCategories, skills } from './skills.ts';
import { stats } from './stats.ts';

export const red: Ruleset = {
	id: 'cyberpunk-red',
	name: 'Cyberpunk RED',
	stats,
	skills,
	skillCategories,
	roles
};
