-- #71. Defaults: members see rolls at all times; GMs may hide rolls.
-- Change these policies (and rolls/settings.ts) if those decisions change.
-- Names are chosen per campaign, never derived from login details.
alter table public.campaign_members add column display_name text not null default 'Player'
	check (char_length(btrim(display_name)) between 1 and 80);

create function public.set_campaign_display_name(campaign uuid, member_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
	update public.campaign_members set display_name = btrim(member_name)
	where campaign_id = campaign and user_id = (select auth.uid());
	if not found then
		raise exception 'Join this campaign before choosing a display name' using errcode = '42501';
	end if;
end;
$$;
revoke all on function public.set_campaign_display_name(uuid, text) from public;
grant execute on function public.set_campaign_display_name(uuid, text) to authenticated;

create table public.campaign_rolls (
	id uuid primary key,
	campaign_id uuid not null references public.campaigns(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	-- Filled by the insert trigger from campaign membership, never the payload.
	roller_name text not null,
	sequence bigint generated always as identity,
	created_at timestamptz not null default clock_timestamp(),
	rolled_at timestamptz not null,
	character_id text,
	label text not null check (char_length(label) between 1 and 2000),
	kind text not null check (kind in ('skill', 'stat', 'damage', 'free')),
	result jsonb not null check (
		jsonb_typeof(result) = 'object'
		and jsonb_typeof(result->'rolls') = 'array'
		and jsonb_array_length(result->'rolls') between 1 and 200
		and jsonb_typeof(result->'modifier') = 'number'
		and jsonb_typeof(result->'total') = 'number'
		and result ?& array['rolls', 'modifier', 'total']
	),
	hidden boolean not null default false
);
create index campaign_rolls_recent on public.campaign_rolls(campaign_id, sequence desc);
alter table public.campaign_rolls enable row level security;

create policy "Members read public rolls; GMs also read hidden rolls"
on public.campaign_rolls for select to authenticated using (
	public.is_campaign_member(campaign_id)
	and (not hidden or public.is_campaign_gm(campaign_id))
);
create policy "Members post as themselves; only GMs hide rolls"
on public.campaign_rolls for insert to authenticated with check (
	user_id = (select auth.uid()) and public.is_campaign_member(campaign_id)
	and (not hidden or public.is_campaign_gm(campaign_id))
);
-- No client edits or deletes, nor client-supplied ordering/timestamps.
grant select on public.campaign_rolls to authenticated;
grant insert (id, campaign_id, user_id, rolled_at, character_id, label, kind, result, hidden)
	on public.campaign_rolls to authenticated;
grant usage on sequence public.campaign_rolls_sequence_seq to authenticated;

-- Serialize posts per campaign, including multi-row inserts, before pruning.
create function public.lock_campaign_rolls() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
	new.roller_name := coalesce((
		select display_name from public.campaign_members
		where campaign_id = new.campaign_id and user_id = new.user_id
	), 'Player');
	perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.campaign_id::text, 71));
	return new;
end;
$$;
create trigger lock_campaign_rolls before insert on public.campaign_rolls
for each row execute function public.lock_campaign_rolls();

create function public.trim_campaign_rolls() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
	delete from public.campaign_rolls where campaign_id = new.campaign_id and id in (
		select id from public.campaign_rolls where campaign_id = new.campaign_id
		order by sequence desc offset 100
	);
	return null;
end;
$$;
create trigger trim_campaign_rolls after insert on public.campaign_rolls
for each row execute function public.trim_campaign_rolls();
revoke all on function public.lock_campaign_rolls(), public.trim_campaign_rolls() from public;

-- PGlite has no Realtime service; Supabase already owns this publication.
do $$ begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		alter publication supabase_realtime add table public.campaign_rolls;
	end if;
end $$;
