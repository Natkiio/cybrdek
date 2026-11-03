import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.ts';

let client: SupabaseClient | undefined;

/**
 * The shared Supabase client. Browser-only: call it from onMount or event
 * handlers, never at module load, so server rendering never touches auth.
 */
export function supabase(): SupabaseClient {
	client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
	});
	return client;
}
