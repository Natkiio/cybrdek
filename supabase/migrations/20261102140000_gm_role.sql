-- GM-1 (#37): who counts as the Game Master.
--
-- Anyone can sign in with a magic link, but only emails listed in public.gms
-- can write campaign content. Every write policy calls public.is_gm(), so the
-- check happens in the database, not just in the UI.

create table public.gms (
	email text primary key check (email = lower(email))
);

comment on table public.gms is 'Emails allowed to edit campaign content. Managed by hand (SQL), never from the app.';

-- RLS on with no policies: the API can't read or change this table at all.
alter table public.gms enable row level security;

-- True when the signed-in user's (verified, magic-link) email is a GM.
-- security definer lets it read public.gms despite RLS; an empty search_path
-- stops anyone shadowing the tables it uses.
create function public.is_gm()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.gms g
		where g.email = lower(coalesce(auth.jwt() ->> 'email', ''))
	);
$$;

revoke all on function public.is_gm() from public;
grant execute on function public.is_gm() to anon, authenticated;
