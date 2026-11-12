// Edge Function (Deno). Supabase provides SUPABASE_URL and the service role
// key to every function; the key never leaves Supabase or enters this repo.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
	auth: { persistSession: false, autoRefreshToken: false }
});

Deno.serve((req) =>
	handle(req, {
		async claim(email, code) {
			const { data, error } = await admin.rpc('claim_password_reset', { player_email: email, code });
			if (error) throw error;
			return (data as string | null) ?? null;
		},
		async setPassword(userId, password) {
			const { error } = await admin.auth.admin.updateUserById(userId, { password });
			if (error) throw error;
		}
	})
);
