-- #70. Raw encounters are GM-only. Players receive an allowlisted server view.
create table public.campaign_encounters (
	id uuid primary key default gen_random_uuid(),
	campaign_id uuid not null references public.campaigns(id) on delete cascade,
	state jsonb not null,
	revision bigint not null default 1,
	created_at timestamptz not null default clock_timestamp(),
	ended_at timestamptz
);
create unique index one_active_campaign_encounter on public.campaign_encounters(campaign_id) where ended_at is null;
create index campaign_encounters_recent on public.campaign_encounters(campaign_id, created_at desc);
alter table public.campaign_encounters enable row level security;
-- No API table grants or policies, including for the GM: use the checked RPCs.
revoke all on public.campaign_encounters from public, anon, authenticated;

-- Players cannot subscribe to raw rows: Realtime enforces SELECT permissions.
-- Publish only these non-sensitive invalidations, then refetch the checked view.
create table public.campaign_encounter_updates (
	campaign_id uuid primary key references public.campaigns(id) on delete cascade,
	revision bigint not null default 1
);
alter table public.campaign_encounter_updates enable row level security;
revoke all on public.campaign_encounter_updates from public, anon, authenticated;
grant select on public.campaign_encounter_updates to authenticated;
create policy "Members receive encounter invalidations" on public.campaign_encounter_updates
for select to authenticated using (public.is_campaign_member(campaign_id));

-- Same highest-worn-SP rule as rulesets/red/armor.ts, including Bodyweight Suits.
create function public.encounter_sp(gear jsonb, location text) returns numeric
language sql immutable set search_path = '' as $$
	select coalesce(max(greatest(0, least((g->>'sp')::numeric,
		coalesce((g->'currentSp'->>location)::numeric, (g->>'sp')::numeric)))), 0)
	from jsonb_array_elements(gear) g
	where g->>'kind' = 'armor' and (g->>'equipped') is distinct from 'false'
	and (g->>'location' in (location, 'both') or g->>'armorType' = 'bodyweight-suit' or g->>'name' = 'Bodyweight Suit');
$$;

create function public.validate_campaign_encounter(campaign uuid, snapshot jsonb, previous jsonb)
returns void language plpgsql set search_path = '' as $$
declare c jsonb; g jsonb; n text;
begin
	if jsonb_typeof(snapshot) is distinct from 'object' or octet_length(snapshot::text) > 400000
		or jsonb_typeof(snapshot->'combatants') is distinct from 'array'
		or jsonb_typeof(snapshot->'started') is distinct from 'boolean'
		or jsonb_typeof(snapshot->'round') is distinct from 'number'
		or not (snapshot ? 'currentId') or jsonb_typeof(snapshot->'currentId') not in ('string','null') then
		raise exception 'Invalid encounter' using errcode = '23514';
	end if;
	if jsonb_array_length(snapshot->'combatants') > 200 or (snapshot->>'round')::numeric < 0
		or (snapshot->>'round')::numeric <> trunc((snapshot->>'round')::numeric) then
		raise exception 'Invalid encounter size or round' using errcode = '23514';
	end if;
	for c in select * from jsonb_array_elements(snapshot->'combatants') loop
		if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'id') is distinct from 'string'
			or char_length(c->>'id') not between 1 and 100
			or jsonb_typeof(c->'name') is distinct from 'string' or char_length(c->>'name') not between 1 and 200
			or jsonb_typeof(c->'out') is distinct from 'boolean'
			or jsonb_typeof(c->'gear') is distinct from 'array'
			or (c ? 'dead' and jsonb_typeof(c->'dead') is distinct from 'boolean') then
			raise exception 'Invalid combatant' using errcode = '23514';
		end if;
		foreach n in array array['hp','maxHp','ref','tiebreak'] loop
			if jsonb_typeof(c->n) is distinct from 'number' then raise exception 'Invalid combatant number' using errcode = '23514'; end if;
		end loop;
		if (c->>'maxHp')::numeric not between 1 and 10000 or (c->>'hp')::numeric < 0
			or (c->>'hp')::numeric > (c->>'maxHp')::numeric
			or (c->>'ref')::numeric not between 0 and 100
			or not (c ? 'initiative') or jsonb_typeof(c->'initiative') not in ('null','number') then
			raise exception 'Invalid combatant numbers' using errcode = '23514';
		end if;
		if (c ? 'characterId') or (c ? 'characterOwnerId') then
			if jsonb_typeof(c->'characterId') is distinct from 'string' or jsonb_typeof(c->'characterOwnerId') is distinct from 'string' then
				raise exception 'PC references need an owner and character' using errcode = '23514';
			end if;
			-- Previously captured PCs remain snapshots if their owner leaves mid-fight.
			if not exists (select 1 from jsonb_array_elements(coalesce(previous->'combatants', '[]')) old
				where old->>'id' = c->>'id' and old->>'characterId' = c->>'characterId' and old->>'characterOwnerId' = c->>'characterOwnerId')
			and not exists (select 1 from public.characters ch join public.campaign_members m
				on m.campaign_id = ch.campaign_id and m.user_id = ch.user_id
				where ch.campaign_id = campaign and ch.user_id::text = c->>'characterOwnerId'
				and ch.id = c->>'characterId' and ch.deleted_at is null) then
				raise exception 'That character is not in this campaign' using errcode = '42501';
			end if;
		end if;
		for g in select * from jsonb_array_elements(c->'gear') loop
			if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'id') is distinct from 'string'
				or jsonb_typeof(g->'kind') is distinct from 'string' then raise exception 'Invalid gear' using errcode = '23514'; end if;
			if g->>'kind' = 'armor' then
				if jsonb_typeof(g->'sp') is distinct from 'number' or (g->>'sp')::numeric not between 0 and 30
					or coalesce(g->>'location','') not in ('head','body','both')
					or (g ? 'equipped' and jsonb_typeof(g->'equipped') is distinct from 'boolean')
					or (g ? 'currentSp' and jsonb_typeof(g->'currentSp') is distinct from 'object') then
					raise exception 'Invalid armor' using errcode = '23514';
				end if;
				foreach n in array array['head','body'] loop
					if g->'currentSp' ? n and (jsonb_typeof(g->'currentSp'->n) is distinct from 'number'
						or (g->'currentSp'->>n)::numeric not between 0 and (g->>'sp')::numeric) then
						raise exception 'Invalid current SP' using errcode = '23514';
					end if;
				end loop;
			end if;
		end loop;
	end loop;
	if (select count(*) <> count(distinct e.value->>'id') from jsonb_array_elements(snapshot->'combatants') as e(value))
		or (select count(*) <> count(distinct (e.value->>'characterOwnerId', e.value->>'characterId'))
			from jsonb_array_elements(snapshot->'combatants') as e(value) where e.value ? 'characterId') then
		raise exception 'Duplicate combatant' using errcode = '23514';
	end if;
	if snapshot->>'currentId' is not null and not exists (select 1 from jsonb_array_elements(snapshot->'combatants') as e(value) where e.value->>'id' = snapshot->>'currentId')
		or ((snapshot->>'started')::boolean and ((snapshot->>'round')::numeric < 1 or snapshot->>'currentId' is null)) then
		raise exception 'Invalid current turn' using errcode = '23514';
	end if;
end;
$$;

create function public.campaign_encounter_view(campaign uuid, owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare fight public.campaign_encounters; visible jsonb; c jsonb; item jsonb; gm boolean;
begin
	if owner is null or owner is distinct from auth.uid() or not public.is_campaign_member(campaign) then
		raise exception 'Campaign membership required' using errcode = '42501';
	end if;
	gm := public.is_campaign_gm(campaign);
	select * into fight from public.campaign_encounters where campaign_id = campaign
	order by (ended_at is null) desc, created_at desc, id desc limit 1;
	if not found then return jsonb_build_object('id', null, 'revision', 0, 'canManage', gm, 'ended', false,
		'encounter', jsonb_build_object('started', false, 'round', 0, 'currentId', null, 'combatants', '[]'::jsonb)); end if;
	if gm then visible := fight.state;
	else
		visible := jsonb_build_object('started', fight.state->'started', 'round', fight.state->'round',
			'currentId', fight.state->'currentId', 'combatants', '[]'::jsonb);
		for c in select * from jsonb_array_elements(fight.state->'combatants') loop
			-- Allowlist, never subtraction: arbitrary extra JSON keys cannot leak.
			item := jsonb_build_object('id', c->'id', 'name', c->'name', 'side', case when c ? 'characterOwnerId' then 'pc' else 'npc' end,
				'wound', case when c->>'dead' = 'true' then 'dead'
				when (c->>'hp')::numeric < 1 then 'mortally'
				when (c->>'hp')::numeric < ceil((c->>'maxHp')::numeric / 2) then 'seriously'
				when (c->>'hp')::numeric < (c->>'maxHp')::numeric then 'lightly' else 'unhurt' end);
			if c->>'characterOwnerId' = auth.uid()::text then
				item := item || jsonb_build_object('characterId', c->'characterId', 'hp', c->'hp', 'maxHp', c->'maxHp',
					'sp', jsonb_build_object('head', public.encounter_sp(c->'gear','head'), 'body', public.encounter_sp(c->'gear','body')));
			end if;
			visible := jsonb_set(visible, '{combatants}', (visible->'combatants') || jsonb_build_array(item));
		end loop;
	end if;
	return jsonb_build_object('id', fight.id, 'revision', fight.revision, 'canManage', gm, 'ended', fight.ended_at is not null, 'encounter', visible);
end;
$$;

-- Null fight_id creates a fight; subsequent changes must name the exact revision.
create function public.save_campaign_encounter(campaign uuid, owner uuid, fight_id uuid, expected_revision bigint, snapshot jsonb, finish boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare fight public.campaign_encounters; c jsonb; old_c jsonb; normalized jsonb := '[]';
begin
	if owner is null or owner is distinct from auth.uid() or not public.is_campaign_gm(campaign) then
		raise exception 'Only this campaign GM can run combat' using errcode = '42501';
	end if;
	perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(campaign::text, 70));
	if fight_id is null then
		if expected_revision is distinct from 0 or finish is distinct from false
			or exists (select 1 from public.campaign_encounters where campaign_id = campaign and ended_at is null) then
			raise exception 'The fight changed. Refresh before editing.' using errcode = '40001';
		end if;
	else
		select * into fight from public.campaign_encounters where id = fight_id and campaign_id = campaign for update;
		if not found or fight.ended_at is not null or expected_revision is distinct from fight.revision then
			raise exception 'The fight changed. Refresh before editing.' using errcode = '40001';
		end if;
	end if;
	perform public.validate_campaign_encounter(campaign, snapshot, fight.state);
	-- Preserve the starting HP independently of client edits, for the owner's
	-- later opt-in carry-over flow. No private character write happens here.
	for c in select * from jsonb_array_elements(snapshot->'combatants') loop
		select e.value into old_c from jsonb_array_elements(coalesce(fight.state->'combatants','[]')) as e(value)
		where e.value->>'id' = c->>'id';
		normalized := normalized || jsonb_build_array(c || jsonb_build_object('startingHp', coalesce(old_c->'startingHp', c->'hp')));
	end loop;
	snapshot := jsonb_set(snapshot, '{combatants}', normalized);
	if fight_id is null then
		insert into public.campaign_encounters(campaign_id, state) values(campaign, snapshot) returning * into fight;
	else
		update public.campaign_encounters set state = snapshot, revision = revision + 1,
			ended_at = case when finish then clock_timestamp() else null end where id = fight_id returning * into fight;
	end if;
	insert into public.campaign_encounter_updates(campaign_id) values(campaign)
	on conflict(campaign_id) do update set revision = public.campaign_encounter_updates.revision + 1;
	-- No GM write-back to private character sheets. Owner acceptance is a follow-up.
	return public.campaign_encounter_view(campaign, owner);
end;
$$;
revoke all on function public.encounter_sp(jsonb,text), public.validate_campaign_encounter(uuid,jsonb,jsonb),
	public.campaign_encounter_view(uuid,uuid), public.save_campaign_encounter(uuid,uuid,uuid,bigint,jsonb,boolean)
from public, anon, authenticated;
grant execute on function public.campaign_encounter_view(uuid,uuid), public.save_campaign_encounter(uuid,uuid,uuid,bigint,jsonb,boolean) to authenticated;

do $$ begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		alter publication supabase_realtime add table public.campaign_encounter_updates;
	end if;
end $$;
