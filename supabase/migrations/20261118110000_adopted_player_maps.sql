-- #62 review fix: "not active" only protected the map on show right now. Once
-- the GM showed a player's map and later switched away, its uploader could
-- delete it again, and its pins (the GM's hidden ones too) with it, through
-- the cascade. A map the GM has ever shown is now adopted: from then on only
-- the GM changes or removes it and its images. Who uploaded it stays recorded.

alter table public.campaign_maps add column adopted boolean not null default false;
-- Already-shown maps and the GM's own (no uploader) count as adopted.
update public.campaign_maps set adopted = true where active or uploaded_by is null;

create or replace function public.set_active_map(campaign uuid, map uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
	if not public.is_campaign_gm(campaign) then
		raise exception 'Only this campaign''s GM can choose its map.' using errcode = '42501';
	end if;
	if map is not null and not exists (select 1 from public.campaign_maps where id = map and campaign_id = campaign) then
		raise exception 'That map is not in this campaign.' using errcode = '42501';
	end if;
	update public.campaign_maps set active = false where campaign_id = campaign and active and id is distinct from map;
	update public.campaign_maps set active = true, adopted = true where id = map;
end;
$$;

drop policy "A player removes a map they added, unless it's shown" on public.campaign_maps;
create policy "A player removes a map they added, until the GM adopts it" on public.campaign_maps for delete
to authenticated using (
	uploaded_by = (select auth.uid()) and not adopted and not active
	and (select public.is_campaign_member(campaign_id))
);

create or replace function public.can_write_map_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_maps m, public.map_object_owner(object_name) o
		where m.id = o.map and m.campaign_id = o.campaign
			and (public.is_campaign_gm(m.campaign_id)
				or (m.uploaded_by = auth.uid() and not m.adopted and not m.active
					and public.can_upload_map(m.campaign_id)))
	);
$$;
create or replace function public.can_remove_map_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_maps m, public.map_object_owner(object_name) o
		where m.id = o.map and m.campaign_id = o.campaign
			and (public.is_campaign_gm(m.campaign_id)
				or (m.uploaded_by = auth.uid() and not m.adopted and not m.active
					and public.is_campaign_member(m.campaign_id)))
	);
$$;
