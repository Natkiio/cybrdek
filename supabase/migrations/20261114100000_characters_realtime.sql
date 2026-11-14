-- GM dashboard (#53): changes to characters reach the GM live. Realtime checks
-- the same row-level security as a normal read, so a GM only hears about
-- characters they may read, and the app refetches through RLS anyway.
-- PGlite has no Realtime service; Supabase already owns this publication.
do $$ begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
		and not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'characters'
		) then
		alter publication supabase_realtime add table public.characters;
	end if;
end $$;
