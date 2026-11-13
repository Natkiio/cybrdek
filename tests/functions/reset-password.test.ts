// The reset-password Edge Function's logic, with fake Supabase calls.
import { describe, expect, it, vi } from 'vitest';
import { handle, MESSAGES, type ResetDeps } from '../../supabase/functions/reset-password/handler.ts';

const post = (body: unknown) =>
	new Request('https://x.supabase.co/functions/v1/reset-password', {
		method: 'POST',
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
const deps = (player: string | null = 'player-id'): ResetDeps & { claim: ReturnType<typeof vi.fn>; setPassword: ReturnType<typeof vi.fn> } => ({
	claim: vi.fn(async () => player),
	setPassword: vi.fn(async () => {})
});
const good = { email: ' player@example.com ', code: '3F9A-0C21-B7E4', password: 'new password' };

describe('reset-password', () => {
	it('a right code sets the new password for that player', async () => {
		const d = deps();
		const res = await handle(post(good), d);
		expect(res.status).toBe(200);
		expect(d.claim).toHaveBeenCalledWith('player@example.com', '3F9A-0C21-B7E4');
		expect(d.setPassword).toHaveBeenCalledWith('player-id', 'new password');
	});

	it('a wrong code changes nothing', async () => {
		const d = deps(null);
		const res = await handle(post(good), d);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: MESSAGES.badCode });
		expect(d.setPassword).not.toHaveBeenCalled();
	});

	it("a bad password is refused before the code is spent", async () => {
		for (const [password, message] of [
			['short', MESSAGES.shortPassword],
			['é'.repeat(37), MESSAGES.longPassword] // 74 bytes: bcrypt would cut it short
		]) {
			const d = deps();
			const res = await handle(post({ ...good, password }), d);
			expect(await res.json()).toEqual({ error: message });
			expect(d.claim).not.toHaveBeenCalled();
		}
	});

	it('missing or malformed input is refused', async () => {
		for (const body of ['not json', {}, { ...good, email: '' }, { ...good, code: 5 }, null]) {
			const d = deps();
			expect((await handle(post(body), d)).status).toBe(400);
			expect(d.claim).not.toHaveBeenCalled();
		}
	});

	it('says so if the password could not be set after the code was used', async () => {
		const d = deps();
		d.setPassword.mockRejectedValue(new Error('auth down'));
		const res = await handle(post(good), d);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: MESSAGES.failed });
	});

	it('answers the browser preflight, and only POSTs otherwise', async () => {
		const pre = await handle(new Request('https://x/', { method: 'OPTIONS' }), deps());
		expect(pre.status).toBe(204);
		expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect((await handle(new Request('https://x/'), deps())).status).toBe(405);
	});
});
