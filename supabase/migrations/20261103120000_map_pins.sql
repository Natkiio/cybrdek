-- MP-1 (#39): GM-placed pins on the Voyage City map, plus GM edits to the
-- traced districts (rename, link to a lore entry).
--
-- Coordinates are in map-image pixels (3840 × 2160 source image), so pins stay
-- put whatever size the map is drawn at.
--
-- Visibility rule (issue #39): players never see a pin that the GM hid, or one
-- that links to a hidden lore entry. Enforced here with RLS.

create table public.map_pins (
	id uuid primary key default gen_random_uuid(),
	x real not null check (x >= 0 and x <= 3840),
	y real not null check (y >= 0 and y <= 2160),
	label text not null check (char_length(btrim(label)) between 1 and 80),
	lore_entry_id uuid references public.lore_entries (id) on delete set null,
	visible boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger map_pins_touch
before update on public.map_pins
for each row execute function public.touch_updated_at();

alter table public.map_pins enable row level security;

create policy "Players read visible pins whose lore is visible; the GM reads all"
on public.map_pins for select
to anon, authenticated
using (
	(select public.is_gm())
	or (
		visible
		and (
			lore_entry_id is null
			or exists (select 1 from public.lore_entries e where e.id = lore_entry_id and e.visible)
		)
	)
);

create policy "Only the GM adds pins" on public.map_pins for insert
to authenticated with check ((select public.is_gm()));
create policy "Only the GM edits pins" on public.map_pins for update
to authenticated using ((select public.is_gm())) with check ((select public.is_gm()));
create policy "Only the GM deletes pins" on public.map_pins for delete
to authenticated using ((select public.is_gm()));

grant select on public.map_pins to anon, authenticated;
grant insert, update, delete on public.map_pins to authenticated;

-- GM changes to a traced district. The shapes themselves live in the app
-- (src/lib/map/districts.ts); a row here only overrides the name or link.
create table public.map_districts (
	district_id text primary key check (district_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	name text check (name is null or char_length(btrim(name)) between 1 and 80),
	lore_entry_id uuid references public.lore_entries (id) on delete set null,
	updated_at timestamptz not null default now()
);

create trigger map_districts_touch
before update on public.map_districts
for each row execute function public.touch_updated_at();

alter table public.map_districts enable row level security;

-- Overrides are readable by everyone: names are printed on the map anyway,
-- and a lore_entry_id on its own reveals nothing (players can't read a hidden
-- entry, so the app simply shows no link for it).
create policy "Anyone reads district overrides" on public.map_districts for select
to anon, authenticated using (true);
create policy "Only the GM adds district overrides" on public.map_districts for insert
to authenticated with check ((select public.is_gm()));
create policy "Only the GM edits district overrides" on public.map_districts for update
to authenticated using ((select public.is_gm())) with check ((select public.is_gm()));
create policy "Only the GM deletes district overrides" on public.map_districts for delete
to authenticated using ((select public.is_gm()));

grant select on public.map_districts to anon, authenticated;
grant insert, update, delete on public.map_districts to authenticated;
