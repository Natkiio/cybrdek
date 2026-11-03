-- LR-1 (#38): the campaign lore wiki.
--
-- Players (anon or signed in) read only entries the GM has made visible.
-- Only the GM (public.is_gm(), see 20261102140000_gm_role.sql) can see hidden
-- entries or write anything. Enforced here, not in the app.

create table public.lore_entries (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	title text not null check (char_length(btrim(title)) between 1 and 120),
	type text not null default 'other'
		check (type in ('character', 'location', 'faction', 'event', 'other')),
	summary text not null default '' check (char_length(summary) <= 280),
	body text not null default '' check (char_length(body) <= 100000),
	visible boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on column public.lore_entries.visible is 'false = GM only. Players never receive hidden rows (RLS).';

-- Keep updated_at honest without trusting the client.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

create trigger lore_entries_touch
before update on public.lore_entries
for each row execute function public.touch_updated_at();

alter table public.lore_entries enable row level security;

create policy "Players read visible entries; the GM reads all"
on public.lore_entries for select
to anon, authenticated
using (visible or (select public.is_gm()));

create policy "Only the GM adds entries"
on public.lore_entries for insert
to authenticated
with check ((select public.is_gm()));

create policy "Only the GM edits entries"
on public.lore_entries for update
to authenticated
using ((select public.is_gm()))
with check ((select public.is_gm()));

create policy "Only the GM deletes entries"
on public.lore_entries for delete
to authenticated
using ((select public.is_gm()));

grant select on public.lore_entries to anon, authenticated;
grant insert, update, delete on public.lore_entries to authenticated;
