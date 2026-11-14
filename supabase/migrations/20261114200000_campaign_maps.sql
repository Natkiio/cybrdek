-- MP-3 (#62): a campaign's own maps. The GM uploads images (shrunk to WebP, or
-- JPEG where the browser can't make WebP, e.g. Safari), names them and picks the active one; members see it, and so
-- does anyone when the campaign is public. Pins belong to one map. Voyage City
-- keeps its built-in map: its pins have no map_id.

create table public.campaign_maps (
	id uuid primary key default gen_random_uuid(),
	campaign_id uuid not null references public.campaigns (id) on delete cascade,
	name text not null check (char_length(btrim(name)) between 1 and 80),
	-- Logical size: the full image's pixels. Pins use these coordinates.
	width int not null check (width between 16 and 8192),
	height int not null check (height between 16 and 8192),
	active boolean not null default false,
	created_at timestamptz not null default now()
);
create index campaign_maps_campaign on public.campaign_maps (campaign_id);
create unique index one_active_map on public.campaign_maps (campaign_id) where active;
alter table public.campaign_maps enable row level security;

create policy "Readers of a campaign see its maps" on public.campaign_maps for select
to anon, authenticated using ((select public.can_read_campaign(campaign_id)));
create policy "A campaign's GM adds maps" on public.campaign_maps for insert
to authenticated with check ((select public.is_campaign_gm(campaign_id)) and not active);
create policy "A campaign's GM renames maps" on public.campaign_maps for update
to authenticated using ((select public.is_campaign_gm(campaign_id)))
with check ((select public.is_campaign_gm(campaign_id)));
create policy "A campaign's GM deletes maps" on public.campaign_maps for delete
to authenticated using ((select public.is_campaign_gm(campaign_id)));

grant select on public.campaign_maps to anon, authenticated;
grant insert (campaign_id, name, width, height) on public.campaign_maps to authenticated;
grant update (name) on public.campaign_maps to authenticated;
grant delete on public.campaign_maps to authenticated;

-- Hosting cost: at most 10 maps per campaign.
create function public.limit_campaign_maps() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
	perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.campaign_id::text, 62));
	if (select count(*) from public.campaign_maps where campaign_id = new.campaign_id) >= 10 then
		raise exception 'A campaign can have up to 10 maps. Delete one first.' using errcode = '23514';
	end if;
	return new;
end;
$$;
create trigger limit_campaign_maps before insert on public.campaign_maps
for each row execute function public.limit_campaign_maps();

-- Switching the active map is two row changes, so it goes through one checked call.
create function public.set_active_map(campaign uuid, map uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
	if not public.is_campaign_gm(campaign) then
		raise exception 'Only this campaign''s GM can choose its map.' using errcode = '42501';
	end if;
	if map is not null and not exists (select 1 from public.campaign_maps where id = map and campaign_id = campaign) then
		raise exception 'That map is not in this campaign.' using errcode = '42501';
	end if;
	update public.campaign_maps set active = false where campaign_id = campaign and active and id is distinct from map;
	update public.campaign_maps set active = true where id = map;
end;
$$;

-- ---- pins belong to a map

alter table public.map_pins add column map_id uuid references public.campaign_maps (id) on delete cascade;
create index map_pins_map on public.map_pins (map_id);
alter table public.map_pins drop constraint map_pins_x_check;
alter table public.map_pins drop constraint map_pins_y_check;
alter table public.map_pins add constraint map_pins_x_check check (x >= 0 and x <= 8192);
alter table public.map_pins add constraint map_pins_y_check check (y >= 0 and y <= 8192);

-- A pin sits on its own campaign's map, inside the image. No map_id means the
-- built-in Voyage City map (3840 × 2160).
create function public.check_pin_on_map() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
	map public.campaign_maps;
begin
	if new.map_id is null then
		if new.x > 3840 or new.y > 2160 then
			raise exception 'That pin is off the map.' using errcode = '23514';
		end if;
		return new;
	end if;
	select * into map from public.campaign_maps where id = new.map_id;
	if not found or map.campaign_id <> new.campaign_id then
		raise exception 'That map is not in this campaign.' using errcode = '23514';
	end if;
	if new.x > map.width or new.y > map.height then
		raise exception 'That pin is off the map.' using errcode = '23514';
	end if;
	return new;
end;
$$;
create trigger check_pin_on_map before insert or update on public.map_pins
for each row execute function public.check_pin_on_map();

revoke all on function public.limit_campaign_maps(), public.check_pin_on_map() from public, anon, authenticated;
revoke all on function public.set_active_map(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_active_map(uuid, uuid) to authenticated;

-- ---- image files: private bucket, one folder per campaign and map
-- Paths are "<campaign id>/<map id>/full" and ".../small" (WebP or JPEG).

-- The campaign and map a storage path names, or null if it isn't a map path.
create function public.map_object_owner(object_name text, out campaign uuid, out map uuid)
language plpgsql immutable set search_path = '' as $$
declare
	parts text[] := pg_catalog.string_to_array(object_name, '/');
begin
	if pg_catalog.array_length(parts, 1) = 3 and parts[3] in ('full', 'small')
		and parts[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		and parts[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
		campaign := parts[1]::uuid;
		map := parts[2]::uuid;
	end if;
end;
$$;
-- Only used inside the checks below, which run as their owner.
revoke all on function public.map_object_owner(text) from public, anon, authenticated;

-- Readers of the campaign may view a map's files; only its GM may add,
-- replace or remove them, and only for a map row that exists in that campaign.
create function public.can_read_map_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_maps m, public.map_object_owner(object_name) o
		where m.id = o.map and m.campaign_id = o.campaign and public.can_read_campaign(m.campaign_id)
	);
$$;
create function public.can_write_map_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_maps m, public.map_object_owner(object_name) o
		where m.id = o.map and m.campaign_id = o.campaign and public.is_campaign_gm(m.campaign_id)
	);
$$;
revoke all on function public.can_read_map_object(text), public.can_write_map_object(text) from public;
grant execute on function public.can_read_map_object(text) to anon, authenticated;
grant execute on function public.can_write_map_object(text) to authenticated;

do $$ begin
	if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
		insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
		values ('campaign-maps', 'campaign-maps', false, 8388608, array['image/webp', 'image/jpeg'])
		on conflict (id) do update set public = false, file_size_limit = 8388608,
			allowed_mime_types = array['image/webp', 'image/jpeg'];

		create policy "Campaign readers view map images" on storage.objects for select
		to anon, authenticated using (bucket_id = 'campaign-maps' and public.can_read_map_object(name));
		create policy "A campaign's GM uploads map images" on storage.objects for insert
		to authenticated with check (bucket_id = 'campaign-maps' and public.can_write_map_object(name));
		create policy "A campaign's GM replaces map images" on storage.objects for update
		to authenticated using (bucket_id = 'campaign-maps' and public.can_write_map_object(name))
		with check (bucket_id = 'campaign-maps' and public.can_write_map_object(name));
		create policy "A campaign's GM removes map images" on storage.objects for delete
		to authenticated using (bucket_id = 'campaign-maps' and public.can_write_map_object(name));
	end if;
end $$;
