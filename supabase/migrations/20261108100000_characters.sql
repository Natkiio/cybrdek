-- SY-1 (#52): characters in the cloud, private to the player who owns them.
-- A device keeps its own copy and syncs when online. The newest save wins for
-- the whole character, and recent versions are kept so an overwrite can be undone.

create table public.characters (
	user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
	id text not null check (length(id) between 1 and 100),
	data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 200000),
	-- When the device saved it, in ms. Decides which save is newest.
	updated_at bigint not null check (updated_at > 0),
	-- Set when deleted, so other devices delete their copy too.
	deleted_at bigint,
	-- The campaign this character plays in, chosen through a later function.
	campaign_id uuid references public.campaigns (id) on delete set null,
	primary key (user_id, id)
);
create index characters_campaign on public.characters (campaign_id);

-- Recent versions, written only by the trigger below.
create table public.character_versions (
	version_id bigint generated always as identity primary key,
	user_id uuid not null,
	character_id text not null,
	data jsonb not null,
	updated_at bigint not null,
	foreign key (user_id, character_id) references public.characters (user_id, id) on delete cascade
);
create index character_versions_lookup on public.character_versions (user_id, character_id, version_id desc);

-- The GM of a campaign can read a character in it while its owner is a member.
create function public.can_gm_read_character(character_campaign uuid, owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select public.is_campaign_gm(character_campaign) and exists (
		select 1 from public.campaign_members m
		where m.campaign_id = character_campaign and m.user_id = owner
	);
$$;
revoke all on function public.can_gm_read_character(uuid, uuid) from public;
grant execute on function public.can_gm_read_character(uuid, uuid) to authenticated;

-- An older save never replaces a newer one, whatever order devices arrive in.
-- The version being replaced goes into the history, newest 20 per character.
create function public.keep_character_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	if new.updated_at < old.updated_at then
		return null;
	end if;
	if new.data is distinct from old.data then
		insert into public.character_versions (user_id, character_id, data, updated_at)
		values (old.user_id, old.id, old.data, old.updated_at);
		delete from public.character_versions
		where user_id = old.user_id and character_id = old.id and version_id not in (
			select version_id from public.character_versions
			where user_id = old.user_id and character_id = old.id
			order by version_id desc limit 20
		);
	end if;
	return new;
end;
$$;
revoke all on function public.keep_character_version() from public;
create trigger keep_version before update on public.characters
for each row execute function public.keep_character_version();

alter table public.characters enable row level security;
alter table public.character_versions enable row level security;

create policy "Owners read theirs; a campaign's GM reads its live characters" on public.characters for select
to authenticated using (
	user_id = (select auth.uid())
	or (deleted_at is null and public.can_gm_read_character(campaign_id, user_id))
);
create policy "Owners add their own" on public.characters for insert
to authenticated with check (user_id = (select auth.uid()));
create policy "Owners change their own" on public.characters for update
to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Owners read their own versions" on public.character_versions for select
to authenticated using (user_id = (select auth.uid()));

-- Nobody signed out gets anything. Rows are never hard-deleted by the app, and
-- campaign_id can't be set directly: joining will go through a checked function.
grant select on public.characters, public.character_versions to authenticated;
grant insert (id, data, updated_at, deleted_at) on public.characters to authenticated;
grant update (data, updated_at, deleted_at) on public.characters to authenticated;

-- Save one character as the signed-in player. A device clock set in the future
-- can't lock out their other devices: the time is capped at now. Returns the
-- time stored, or null if a newer save was already there.
create function public.save_character(
	character_id text, character_data jsonb, saved_at bigint, removed_at bigint default null
) returns bigint language sql security invoker set search_path = '' as $$
	insert into public.characters as c (id, data, updated_at, deleted_at)
	values (
		character_id, character_data,
		least(saved_at, (extract(epoch from now()) * 1000)::bigint),
		removed_at
	)
	on conflict (user_id, id) do update
	set data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
	returning c.updated_at;
$$;
revoke all on function public.save_character(text, jsonb, bigint, bigint) from public;
grant execute on function public.save_character(text, jsonb, bigint, bigint) to authenticated;
