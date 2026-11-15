import { describe, expect, it } from 'vitest';
import { MAP_CACHE, staleAppCaches } from './cache-names.ts';

describe('staleAppCaches', () => {
	it('clears old app versions but never the offline map images', () => {
		const keys = ['cybrdek-1794000000', 'cybrdek-1795000000', MAP_CACHE, 'someone-elses-cache'];
		expect(staleAppCaches(keys, 'cybrdek-1795000000')).toEqual(['cybrdek-1794000000']);
	});

	it('keeps the map cache even when it is the only other cache', () => {
		expect(staleAppCaches([MAP_CACHE], 'cybrdek-2')).toEqual([]);
	});
});
