// What a real Supabase project does that plain Postgres doesn't: anything new
// in the public schema is fully open to the API roles until a migration narrows
// it (see pg_default_acl on the live project). Tests run migrations after this,
// so a "grant only these columns" that doesn't first revoke the default fails here
// just as it would live. RLS policies still decide which rows anyone sees.
export const SUPABASE_DEFAULT_GRANTS = `
	alter default privileges in schema public grant all on tables to anon, authenticated;
	alter default privileges in schema public grant all on functions to anon, authenticated;
	alter default privileges in schema public grant all on sequences to anon, authenticated;
`;
