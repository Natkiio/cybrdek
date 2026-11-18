-- MP-3 (#62), last part: the GM can let players upload maps too.
-- Off by default. A player's map goes in the campaign's list; only the GM
-- renames it or shows it to the table. A player may remove a map they added
-- while it isn't the one shown, and can't change its images once it is.

alter table public.campaigns add column players_upload_maps boolean not null default false;
grant update (name, players_upload_maps) on public.campaigns to authenticated;

-- Who added each map. Set by the database, never by the client (no grant).
alter table public.campaign_maps
	add column uploaded_by uuid references auth.users (id) on delete set null default auth.uid();

-- The GM, or a member when the GM allows it.
create function public.can_upload_map(campaign uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select public.is_campaign_gm(campaign)
		or (public.is_campaign_member(campaign)
			and exists (select 1 from public.campaigns c where c.id = campaign and c.players_upload_maps));
$$;
revoke all on function public.can_upload_map(uuid) from public, anon, authenticated;
grant execute on function public.can_upload_map(uuid) to authenticated;

drop policy "A campaign's GM adds maps" on public.campaign_maps;
create policy "The GM, or players when allowed, add maps" on public.campaign_maps for insert
to authenticated with check ((select public.can_upload_map(campaign_id)) and not active);

create policy "A player removes a map they added, unless it's shown" on public.campaign_maps for delete
to authenticated using (
	uploaded_by = (select auth.uid()) and not active and (select public.is_campaign_member(campaign_id))
);

-- Images: the GM as before. A player only for a map they added that isn't
-- shown: uploading needs the setting on, removing doesn't.
create or replace function public.can_write_map_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_maps m, public.map_object_owner(object_name) o
		where m.id = o.map and m.campaign_id = o.campaign
			and (public.is_campaign_gm(m.campaign_id)
				or (m.uploaded_by = auth.uid() and not m.active and public.can_upload_map(m.campaign_id)))
	);
$$;
create function public.can_remove_map_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_maps m, public.map_object_owner(object_name) o
		where m.id = o.map and m.campaign_id = o.campaign
			and (public.is_campaign_gm(m.campaign_id)
				or (m.uploaded_by = auth.uid() and not m.active and public.is_campaign_member(m.campaign_id)))
	);
$$;
revoke all on function public.can_remove_map_object(text) from public, anon, authenticated;
grant execute on function public.can_remove_map_object(text) to authenticated;

do $$ begin
	if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
		drop policy "A campaign's GM uploads map images" on storage.objects;
		drop policy "A campaign's GM replaces map images" on storage.objects;
		drop policy "A campaign's GM removes map images" on storage.objects;
		create policy "Map uploaders add map images" on storage.objects for insert
		to authenticated with check (bucket_id = 'campaign-maps' and public.can_write_map_object(name));
		create policy "Map uploaders replace map images" on storage.objects for update
		to authenticated using (bucket_id = 'campaign-maps' and public.can_write_map_object(name))
		with check (bucket_id = 'campaign-maps' and public.can_write_map_object(name));
		create policy "Map uploaders remove map images" on storage.objects for delete
		to authenticated using (bucket_id = 'campaign-maps' and public.can_remove_map_object(name));
	end if;
end $$;
