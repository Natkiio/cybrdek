import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Supabase client: we fire auth events by hand and decide when each
// is_gm lookup answers, to reproduce slow-network races (Codex, #40 review).
type Listener = (event: string, session: { user: { email: string } } | null) => void;
let listener: Listener;
let pending: Array<(isGm: boolean) => void>;

// Character sync has its own tests, and needs a browser.
vi.mock('#lib/sync/characters.svelte.ts', () => ({ setSyncUser: vi.fn(), syncCharacters: vi.fn() }));

vi.mock('./client.ts', () => ({
	supabase: () => ({
		auth: { onAuthStateChange: (fn: Listener) => (listener = fn) },
		rpc: () =>
			new Promise((resolve) => pending.push((isGm) => resolve({ data: isGm, error: null })))
	})
}));

const signIn = (email: string) => listener('SIGNED_IN', { user: { email } });
const signOut = () => listener('SIGNED_OUT', null);
const flush = () => new Promise((r) => setTimeout(r, 0));

async function freshModule() {
	vi.resetModules();
	pending = [];
	const mod = await import('./gm.svelte.ts');
	mod.startGmSession();
	return mod.gm;
}

describe('GM session', () => {
	beforeEach(() => {
		pending = [];
	});

	it('becomes GM when the lookup says so', async () => {
		const gm = await freshModule();
		signIn('gm@example.com');
		pending[0](true);
		await flush();
		expect(gm).toMatchObject({ email: 'gm@example.com', isGm: true, ready: true });
	});

	it('ignores a slow lookup that finishes after sign-out', async () => {
		const gm = await freshModule();
		signIn('gm@example.com');
		signOut();
		await flush();
		pending[0](true); // the GM lookup from before sign-out finally answers
		await flush();
		expect(gm).toMatchObject({ email: null, isGm: false });
	});

	it('drops GM mode at once when another account signs in, and ignores the old lookup', async () => {
		const gm = await freshModule();
		signIn('gm@example.com');
		pending[0](true);
		await flush();
		signIn('player@example.com');
		expect(gm.isGm).toBe(false); // no GM controls while the new check runs
		pending[1](false);
		await flush();
		expect(gm).toMatchObject({ email: 'player@example.com', isGm: false });
	});

	it('keeps GM mode through a token refresh for the same account', async () => {
		const gm = await freshModule();
		signIn('gm@example.com');
		pending[0](true);
		await flush();
		listener('TOKEN_REFRESHED', { user: { email: 'gm@example.com' } });
		expect(gm.isGm).toBe(true); // no flicker
		pending[1](true);
		await flush();
		expect(gm.isGm).toBe(true);
	});
});
