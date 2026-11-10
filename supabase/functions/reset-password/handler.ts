// Forgotten password, step 2: the player sends their email, the one-time code
// the app's admin gave them, and a new password. Pure, so Vitest can test it;
// index.ts wires in Supabase's admin API.

export interface ResetDeps {
	/** The player's id if the code is right (and spends it), else null. */
	claim(email: string, code: string): Promise<string | null>;
	setPassword(userId: string, password: string): Promise<void>;
}

const CORS = {
	'Access-Control-Allow-Origin': '*', // the code is the credential; no cookies are involved
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const MESSAGES = {
	badCode: "That code didn't work. Codes work once, for 30 minutes, for the email they were made for. Ask for a new one.",
	badRequest: 'Enter your email, the code and a new password.',
	shortPassword: 'Use at least 8 characters for the new password.',
	longPassword: 'That password is too long. Use 72 characters or fewer.',
	failed: 'The code was used, but the password could not be changed. Ask for a new code.'
} as const;

const reply = (status: number, body?: unknown) =>
	new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { ...CORS, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }
	});

export async function handle(req: Request, deps: ResetDeps): Promise<Response> {
	if (req.method === 'OPTIONS') return reply(204);
	if (req.method !== 'POST') return reply(405, { error: 'POST only.' });

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return reply(400, { error: MESSAGES.badRequest });
	}
	const { email, code, password } = (body ?? {}) as Record<string, unknown>;
	if (typeof email !== 'string' || typeof code !== 'string' || typeof password !== 'string' || !email.trim() || !code.trim())
		return reply(400, { error: MESSAGES.badRequest });
	// Checked before the code is spent, so a typo in the password costs nothing.
	if (password.length < 8) return reply(400, { error: MESSAGES.shortPassword });
	if (new TextEncoder().encode(password).length > 72) return reply(400, { error: MESSAGES.longPassword });

	let userId: string | null;
	try {
		userId = await deps.claim(email.trim(), code);
	} catch {
		return reply(500, { error: MESSAGES.failed });
	}
	if (!userId) return reply(400, { error: MESSAGES.badCode });

	try {
		await deps.setPassword(userId, password);
	} catch {
		return reply(500, { error: MESSAGES.failed });
	}
	return reply(200, { ok: true });
}
