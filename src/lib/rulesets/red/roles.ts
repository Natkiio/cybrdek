import type { RoleDef } from '#lib/engine/types.ts';

// The 10 Roles and the name of each Role Ability.
export const roles: RoleDef[] = [
	{ id: 'rockerboy', name: 'Rockerboy', ability: 'Charismatic Impact' },
	{ id: 'solo', name: 'Solo', ability: 'Combat Awareness' },
	{ id: 'netrunner', name: 'Netrunner', ability: 'Interface' },
	{ id: 'tech', name: 'Tech', ability: 'Maker' },
	{ id: 'medtech', name: 'Medtech', ability: 'Medicine' },
	{ id: 'media', name: 'Media', ability: 'Credibility' },
	{ id: 'exec', name: 'Exec', ability: 'Teamwork' },
	{ id: 'lawman', name: 'Lawman', ability: 'Backup' },
	{ id: 'fixer', name: 'Fixer', ability: 'Operator' },
	{ id: 'nomad', name: 'Nomad', ability: 'Moto' }
];
