-- CP-1 (#60): campaigns. Each game gets its own lore, pins, district edits and
-- members; GM rights are per campaign. All checks live here in row-level
-- security, so changing the app's JavaScript can't get around them.
--
-- Existing data moves into a public "Voyage City" campaign, so nothing is lost
-- and it stays readable with no account. The campaign_id column defaults to
-- that campaign for now, so the version of the app already deployed keeps
-- working until the new one is live; a later migration drops the default and
-- the old public.gms / is_gm().

create table public.campaigns (
	id uuid primary key default gen_random_uuid(),
	name text not null check (char_length(btrim(name)) between 1 and 80),
	is_public boolean not null default false, -- readable with no account
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now()
);

create table public.campaign_members (
	campaign_id uuid not null references public.campaigns (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('gm', 'player')),
	joined_at timestamptz not null default now(),
	primary key (campaign_id, user_id)
);

create index campaign_members_user on public.campaign_members (user_id);

-- Invite codes live apart from campaigns so that reading a campaign never
-- reveals how to join it. Only its GMs can read one.
create table public.campaign_invites (
	campaign_id uuid primary key references public.campaigns (id) on delete cascade,
	code text not null unique default replace(gen_random_uuid()::text, '-', '')
);

-- ---- who is who. security definer so these can read campaign_members from
-- inside its own policies without recursing; empty search_path stops shadowing.

create function public.is_campaign_gm(campaign uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_members m
		where m.campaign_id = campaign and m.user_id = auth.uid() and m.role = 'gm'
	);
$$;

create function public.is_campaign_member(campaign uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from public.campaign_members m
		where m.campaign_id = campaign and m.user_id = auth.uid()
	);
$$;

create function public.can_read_campaign(campaign uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select public.is_campaign_member(campaign)
		or exists (select 1 from public.campaigns c where c.id = campaign and c.is_public);
$$;

-- ---- the only ways in: create your own campaign, or use an invite code.

create function public.create_campaign(campaign_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
	new_id uuid;
begin
	if auth.uid() is null then
		raise exception 'Sign in to create a campaign' using errcode = '42501';
	end if;
	insert into public.campaigns (name, created_by) values (btrim(campaign_name), auth.uid()) returning id into new_id;
	insert into public.campaign_members (campaign_id, user_id, role) values (new_id, auth.uid(), 'gm');
	insert into public.campaign_invites (campaign_id) values (new_id);
	return new_id;
end;
$$;

create function public.join_campaign(invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
	found uuid;
begin
	if auth.uid() is null then
		raise exception 'Sign in to join a campaign' using errcode = '42501';
	end if;
	select campaign_id into found from public.campaign_invites where code = invite_code;
	if found is null then
		raise exception 'That invite is not valid' using errcode = 'P0002';
	end if;
	-- Someone already in the campaign keeps their role: a GM can't be demoted here.
	insert into public.campaign_members (campaign_id, user_id, role)
	values (found, auth.uid(), 'player')
	on conflict (campaign_id, user_id) do nothing;
	return found;
end;
$$;

revoke all on function public.is_campaign_gm(uuid), public.is_campaign_member(uuid),
	public.can_read_campaign(uuid), public.create_campaign(text), public.join_campaign(text) from public;
grant execute on function public.is_campaign_gm(uuid), public.is_campaign_member(uuid),
	public.can_read_campaign(uuid) to anon, authenticated;
grant execute on function public.create_campaign(text), public.join_campaign(text) to authenticated;

-- ---- row-level security on the new tables. Writes go through the functions
-- above; nothing grants direct insert on members or invites.

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;

create policy "Read public campaigns and your own" on public.campaigns for select
to anon, authenticated using ((select public.can_read_campaign(id)));
create policy "A GM renames their campaign" on public.campaigns for update
to authenticated using ((select public.is_campaign_gm(id))) with check ((select public.is_campaign_gm(id)));

create policy "See members of your campaigns" on public.campaign_members for select
to authenticated using ((select public.is_campaign_member(campaign_id)));
create policy "Leave, or a GM removes a player" on public.campaign_members for delete
to authenticated using (
	(user_id = (select auth.uid()) and role = 'player')
	or ((select public.is_campaign_gm(campaign_id)) and role = 'player')
);

create policy "Only a campaign's GMs read its invite" on public.campaign_invites for select
to authenticated using ((select public.is_campaign_gm(campaign_id)));

grant select on public.campaigns to anon, authenticated;
grant update (name) on public.campaigns to authenticated;
grant select, delete on public.campaign_members to authenticated;
grant select on public.campaign_invites to authenticated;

-- ---- move the existing world into its own campaign.

insert into public.campaigns (id, name, is_public, created_by)
select '00000000-0000-4000-8000-000000000001', 'Voyage City', true,
	(select u.id from auth.users u join public.gms g on g.email = lower(u.email) order by u.created_at limit 1);

insert into public.campaign_invites (campaign_id) values ('00000000-0000-4000-8000-000000000001');

insert into public.campaign_members (campaign_id, user_id, role)
select '00000000-0000-4000-8000-000000000001', u.id, 'gm'
from auth.users u join public.gms g on g.email = lower(u.email);

alter table public.lore_entries
	add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000001'
	references public.campaigns (id) on delete cascade;
alter table public.map_pins
	add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000001'
	references public.campaigns (id) on delete cascade;
alter table public.map_districts
	add column campaign_id uuid not null default '00000000-0000-4000-8000-000000000001'
	references public.campaigns (id) on delete cascade;

alter table public.lore_entries drop constraint lore_entries_slug_key;
alter table public.lore_entries add constraint lore_entries_campaign_slug unique (campaign_id, slug);
alter table public.map_districts drop constraint map_districts_pkey;
alter table public.map_districts add primary key (campaign_id, district_id);
create index map_pins_campaign on public.map_pins (campaign_id);

-- ---- swap the global GM policies for per-campaign ones.

drop policy "Players read visible entries; the GM reads all" on public.lore_entries;
drop policy "Only the GM adds entries" on public.lore_entries;
drop policy "Only the GM edits entries" on public.lore_entries;
drop policy "Only the GM deletes entries" on public.lore_entries;

create policy "Readers see visible entries; the campaign's GM sees all" on public.lore_entries for select
to anon, authenticated using (
	(select public.is_campaign_gm(campaign_id))
	or (visible and (select public.can_read_campaign(campaign_id)))
);
create policy "A campaign's GM adds entries" on public.lore_entries for insert
to authenticated with check ((select public.is_campaign_gm(campaign_id)));
create policy "A campaign's GM edits entries" on public.lore_entries for update
to authenticated using ((select public.is_campaign_gm(campaign_id)))
with check ((select public.is_campaign_gm(campaign_id)));
create policy "A campaign's GM deletes entries" on public.lore_entries for delete
to authenticated using ((select public.is_campaign_gm(campaign_id)));

drop policy "Players read visible pins whose lore is visible; the GM reads all" on public.map_pins;
drop policy "Only the GM adds pins" on public.map_pins;
drop policy "Only the GM edits pins" on public.map_pins;
drop policy "Only the GM deletes pins" on public.map_pins;

create policy "Readers see visible pins with visible lore; the campaign's GM sees all" on public.map_pins for select
to anon, authenticated using (
	(select public.is_campaign_gm(campaign_id))
	or (
		visible
		and (select public.can_read_campaign(campaign_id))
		and (
			lore_entry_id is null
			or exists (select 1 from public.lore_entries e where e.id = lore_entry_id and e.visible)
		)
	)
);
create policy "A campaign's GM adds pins" on public.map_pins for insert
to authenticated with check ((select public.is_campaign_gm(campaign_id)));
create policy "A campaign's GM edits pins" on public.map_pins for update
to authenticated using ((select public.is_campaign_gm(campaign_id)))
with check ((select public.is_campaign_gm(campaign_id)));
create policy "A campaign's GM deletes pins" on public.map_pins for delete
to authenticated using ((select public.is_campaign_gm(campaign_id)));

drop policy "Anyone reads district overrides" on public.map_districts;
drop policy "Only the GM adds district overrides" on public.map_districts;
drop policy "Only the GM edits district overrides" on public.map_districts;
drop policy "Only the GM deletes district overrides" on public.map_districts;

create policy "Readers of a campaign see its district edits" on public.map_districts for select
to anon, authenticated using ((select public.can_read_campaign(campaign_id)));
create policy "A campaign's GM adds district edits" on public.map_districts for insert
to authenticated with check ((select public.is_campaign_gm(campaign_id)));
create policy "A campaign's GM changes district edits" on public.map_districts for update
to authenticated using ((select public.is_campaign_gm(campaign_id)))
with check ((select public.is_campaign_gm(campaign_id)));
create policy "A campaign's GM deletes district edits" on public.map_districts for delete
to authenticated using ((select public.is_campaign_gm(campaign_id)));
