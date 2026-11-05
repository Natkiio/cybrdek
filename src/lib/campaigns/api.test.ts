import { describe, expect, it } from 'vitest';
import { inviteLink, withRoles } from './api.ts';

describe('withRoles', () => {
	const rows = [
		{ id: 'p', name: 'Public Game', is_public: true },
		{ id: 'b', name: 'Bravo', is_public: false },
		{ id: 'a', name: 'Alpha', is_public: false }
	];

	it('lists your own campaigns first, then by name', () => {
		const listed = withRoles(rows, [
			{ campaign_id: 'b', role: 'player' },
			{ campaign_id: 'a', role: 'gm' }
		]);
		expect(listed.map((c) => [c.name, c.role])).toEqual([
			['Alpha', 'gm'],
			['Bravo', 'player'],
			['Public Game', null]
		]);
	});
});

it('builds an invite link', () => {
	expect(inviteLink('https://cybrdek.vercel.app', 'abc')).toBe('https://cybrdek.vercel.app/join/abc');
});
