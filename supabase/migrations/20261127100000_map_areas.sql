-- GM-drawn districts and wards (Nathan, 27 Nov): the area editor's result,
-- saved per campaign map. map_id null is Voyage City's built-in map (its
-- traced areas in src/lib/map/districts.ts are the starting point until the
-- GM saves); otherwise it's one of the campaign's uploaded maps. Readers of the
-- campaign see its areas (names are printed on the map anyway); only its GM
-- saves them, through save_map_areas, which checks the revision so an older
-- tab can't overwrite newer work.

create table public.map_areas (
	campaign_id uuid not null references public.campaigns (id) on delete cascade,
	map_id uuid references public.campaign_maps (id) on delete cascade,
	areas jsonb not null,
	revision bigint not null default 1,
	updated_at timestamptz not null default now()
);
create unique index map_areas_one_per_map on public.map_areas (campaign_id, map_id) nulls not distinct;
alter table public.map_areas enable row level security;
revoke all on public.map_areas from public, anon, authenticated;
grant select on public.map_areas to anon, authenticated;
create policy "Readers of a campaign see its map areas" on public.map_areas for select
to anon, authenticated using ((select public.can_read_campaign(campaign_id)));

-- The same rules as src/lib/map/areas.ts validateAreas, enforced here too.
create function public.validate_map_areas(list jsonb, max_x numeric, max_y numeric) returns void
language plpgsql immutable set search_path = '' as $$
declare a jsonb; p jsonb; ids text[] := '{}';
begin
	if jsonb_typeof(list) is distinct from 'array' or jsonb_array_length(list) > 300 or octet_length(list::text) > 600000 then
		raise exception 'Invalid areas' using errcode = '23514';
	end if;
	for a in select * from jsonb_array_elements(list) loop
		if jsonb_typeof(a) is distinct from 'object'
			or jsonb_typeof(a->'id') is distinct from 'string' or char_length(a->>'id') not between 1 and 100 or (a->>'id') = any(ids)
			or jsonb_typeof(a->'name') is distinct from 'string' or char_length(btrim(a->>'name')) not between 1 and 80
			or coalesce(a->>'kind', '') not in ('district', 'ward')
			or jsonb_typeof(a->'polygon') is distinct from 'array' or jsonb_array_length(a->'polygon') not between 3 and 200
			or jsonb_typeof(a->'label') is distinct from 'array' or jsonb_array_length(a->'label') <> 2
			or (a->>'kind' = 'ward' and jsonb_typeof(a->'parentId') is distinct from 'string') then
			raise exception 'Invalid area' using errcode = '23514';
		end if;
		ids := array_append(ids, a->>'id');
		for p in select * from jsonb_array_elements(a->'polygon') union all select a->'label' loop
			if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) <> 2
				or jsonb_typeof(p->0) is distinct from 'number' or jsonb_typeof(p->1) is distinct from 'number'
				or (p->>0)::numeric not between 0 and max_x or (p->>1)::numeric not between 0 and max_y then
				raise exception 'Invalid area point' using errcode = '23514';
			end if;
		end loop;
	end loop;
	-- Every ward belongs to a district in the same list.
	if exists (select 1 from jsonb_array_elements(list) w where w->>'kind' = 'ward'
		and not exists (select 1 from jsonb_array_elements(list) d where d->>'kind' = 'district' and d->>'id' = w->>'parentId')) then
		raise exception 'Each ward needs a district' using errcode = '23514';
	end if;
end;
$$;

create function public.save_map_areas(campaign uuid, map uuid, expected_revision bigint, list jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.campaign_maps; row public.map_areas; w numeric := 3840; h numeric := 2160;
begin
	if auth.uid() is null or not public.is_campaign_gm(campaign) then
		raise exception 'Only this campaign''s GM can edit its map areas.' using errcode = '42501';
	end if;
	if map is not null then
		select * into m from public.campaign_maps where id = map and campaign_id = campaign;
		if not found then raise exception 'That map is not in this campaign.' using errcode = '42501'; end if;
		w := m.width; h := m.height;
	end if;
	perform public.validate_map_areas(list, w, h);
	select * into row from public.map_areas where campaign_id = campaign and map_id is not distinct from map for update;
	if not found then
		if expected_revision <> 0 then raise exception 'Refresh before editing' using errcode = '40001'; end if;
		insert into public.map_areas (campaign_id, map_id, areas) values (campaign, map, list);
		return 1;
	end if;
	if expected_revision is distinct from row.revision then raise exception 'Refresh before editing' using errcode = '40001'; end if;
	update public.map_areas set areas = list, revision = row.revision + 1, updated_at = now()
		where campaign_id = campaign and map_id is not distinct from map;
	return row.revision + 1;
end;
$$;

revoke all on function public.validate_map_areas(jsonb, numeric, numeric), public.save_map_areas(uuid, uuid, bigint, jsonb)
	from public, anon, authenticated;
grant execute on function public.save_map_areas(uuid, uuid, bigint, jsonb) to authenticated;
