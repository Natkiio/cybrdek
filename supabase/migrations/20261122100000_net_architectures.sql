-- #100: raw Architectures never reach API roles. Members use a redacted RPC.
create table public.net_architectures (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 state jsonb not null,
 revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp()
);
create index net_architectures_campaign on public.net_architectures(campaign_id, created_at, id);
alter table public.net_architectures enable row level security;
revoke all on public.net_architectures from public, anon, authenticated;

-- Only a campaign/revision signal is published, never a raw Architecture.
create table public.net_architecture_updates (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 revision bigint not null default 1
);
alter table public.net_architecture_updates enable row level security;
revoke all on public.net_architecture_updates from public, anon, authenticated;
grant select on public.net_architecture_updates to authenticated;
create policy "Members receive NET updates" on public.net_architecture_updates
 for select to authenticated using (public.is_campaign_member(campaign_id));

create function public.validate_net_architecture(snapshot jsonb) returns void
language plpgsql set search_path = '' as $$
declare f jsonb; e jsonb; used_ids text[] := '{}';
begin
 if jsonb_typeof(snapshot) is distinct from 'object' or octet_length(snapshot::text) > 400000
  or jsonb_typeof(snapshot->'name') is distinct from 'string'
  or char_length(btrim(snapshot->>'name')) not between 1 and 100
  or jsonb_typeof(snapshot->'gmNotes') is distinct from 'string' or char_length(snapshot->>'gmNotes') > 4000
  or jsonb_typeof(snapshot->'floors') is distinct from 'array' then
  raise exception 'Invalid Architecture' using errcode = '23514';
 end if;
 if jsonb_array_length(snapshot->'floors') > 100 then raise exception 'Too many floors' using errcode = '23514'; end if;
 for f in select * from jsonb_array_elements(snapshot->'floors') loop
  if jsonb_typeof(f) is distinct from 'object'
   or jsonb_typeof(f->'id') is distinct from 'string' or char_length(btrim(f->>'id')) not between 1 and 100
   or (f->>'id') = any(used_ids)
   or jsonb_typeof(f->'label') is distinct from 'string' or char_length(btrim(f->>'label')) not between 1 and 100
   or jsonb_typeof(f->'revealed') is distinct from 'boolean'
   or jsonb_typeof(f->'gmNotes') is distinct from 'string' or char_length(f->>'gmNotes') > 4000
   or jsonb_typeof(f->'entries') is distinct from 'array' then
   raise exception 'Invalid floor' using errcode = '23514';
  end if;
  used_ids := array_append(used_ids, f->>'id');
  if jsonb_array_length(f->'entries') > 20 then raise exception 'Too many entries' using errcode = '23514'; end if;
  for e in select * from jsonb_array_elements(f->'entries') loop
   if jsonb_typeof(e) is distinct from 'object'
    or jsonb_typeof(e->'id') is distinct from 'string' or char_length(btrim(e->>'id')) not between 1 and 100
    or (e->>'id') = any(used_ids)
    or jsonb_typeof(e->'type') is distinct from 'string' or e->>'type' not in ('password','file','control-node','black-ice','demon')
    or jsonb_typeof(e->'name') is distinct from 'string' or char_length(btrim(e->>'name')) not between 1 and 100
    or jsonb_typeof(e->'playerText') is distinct from 'string' or char_length(e->>'playerText') > 2000
    or jsonb_typeof(e->'gmNotes') is distinct from 'string' or char_length(e->>'gmNotes') > 4000
    or not (e ? 'dv') or jsonb_typeof(e->'dv') not in ('null','number')
    or not (e ? 'refId') or jsonb_typeof(e->'refId') not in ('null','string') then
    raise exception 'Invalid entry' using errcode = '23514';
   end if;
   used_ids := array_append(used_ids, e->>'id');
   if jsonb_typeof(e->'dv') = 'number' and ((e->>'dv')::numeric not between 0 and 99
    or (e->>'dv')::numeric <> trunc((e->>'dv')::numeric)) then
    raise exception 'Invalid DV' using errcode = '23514';
   end if;
   if e->>'type' = 'black-ice' then
    if coalesce(e->>'refId','') not in ('asp','giant','hellhound','kraken','liche','raven','scorpion','skunk','wisp','dragon','killer','sabertooth')
     or e->'dv' <> 'null'::jsonb then raise exception 'Invalid ICE reference' using errcode = '23514'; end if;
   elsif e->>'type' = 'demon' then
    if coalesce(e->>'refId','') not in ('imp','efreet','balron') or e->'dv' <> 'null'::jsonb then
     raise exception 'Invalid demon reference' using errcode = '23514'; end if;
   elsif e->'refId' <> 'null'::jsonb then raise exception 'Unexpected security reference' using errcode = '23514';
   end if;
  end loop;
 end loop;
end;
$$;

create function public.campaign_net_architectures(campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.net_architectures; f jsonb; e jsonb; floors jsonb; entries jsonb;
 result jsonb := '[]'; gm boolean;
begin
 if auth.uid() is null or not public.is_campaign_member(campaign) then
  raise exception 'Campaign membership required' using errcode = '42501';
 end if;
 gm := public.is_campaign_gm(campaign);
 for a in select * from public.net_architectures where campaign_id = campaign order by created_at, id loop
  if gm then
   result := result || jsonb_build_array(a.state || jsonb_build_object('id', a.id, 'revision', a.revision));
  else
   floors := '[]';
   for f in select * from jsonb_array_elements(a.state->'floors') loop
    if f->'revealed' = 'true'::jsonb then
     entries := '[]';
     for e in select * from jsonb_array_elements(f->'entries') loop
      -- Explicit allowlist, including on revealed floors. GM notes never leave.
      entries := entries || jsonb_build_array(jsonb_build_object('id',e->'id','type',e->'type','name',e->'name',
       'refId',e->'refId','playerText',e->'playerText'));
     end loop;
     floors := floors || jsonb_build_array(jsonb_build_object('id',f->'id','label',f->'label','entries',entries));
    end if;
   end loop;
   -- Even the name of an entirely unrevealed Architecture stays private.
   if jsonb_array_length(floors) > 0 then
    result := result || jsonb_build_array(jsonb_build_object('id',a.id,'revision',a.revision,'name',a.state->'name','floors',floors));
   end if;
  end if;
 end loop;
 return jsonb_build_object('canManage',gm,'architectures',result);
end;
$$;

create function public.save_net_architecture(campaign uuid, architecture_id uuid, expected_revision bigint, snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.net_architectures;
begin
 if auth.uid() is null or not public.is_campaign_gm(campaign) then
  raise exception 'Only this campaign GM can edit Architectures' using errcode = '42501';
 end if;
 perform public.validate_net_architecture(snapshot);
 if architecture_id is null then
  if expected_revision is distinct from 0 then raise exception 'Refresh before editing' using errcode = '40001'; end if;
  insert into public.net_architectures(campaign_id,state) values(campaign,snapshot);
 else
  select * into a from public.net_architectures where id = architecture_id and campaign_id = campaign for update;
  if not found or expected_revision is distinct from a.revision then raise exception 'Refresh before editing' using errcode = '40001'; end if;
  update public.net_architectures set state = snapshot, revision = revision + 1 where id = architecture_id;
 end if;
 insert into public.net_architecture_updates(campaign_id) values(campaign)
 on conflict(campaign_id) do update set revision = public.net_architecture_updates.revision + 1;
 return public.campaign_net_architectures(campaign);
end;
$$;

create function public.delete_net_architecture(campaign uuid, architecture_id uuid, expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.net_architectures;
begin
 if auth.uid() is null or not public.is_campaign_gm(campaign) then
  raise exception 'Only this campaign GM can delete Architectures' using errcode = '42501';
 end if;
 select * into a from public.net_architectures where id = architecture_id and campaign_id = campaign for update;
 if not found or expected_revision is distinct from a.revision then raise exception 'Refresh before deleting' using errcode = '40001'; end if;
 delete from public.net_architectures where id = architecture_id;
 insert into public.net_architecture_updates(campaign_id) values(campaign)
 on conflict(campaign_id) do update set revision = public.net_architecture_updates.revision + 1;
 return public.campaign_net_architectures(campaign);
end;
$$;
revoke all on function public.validate_net_architecture(jsonb), public.campaign_net_architectures(uuid),
 public.save_net_architecture(uuid,uuid,bigint,jsonb), public.delete_net_architecture(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.campaign_net_architectures(uuid), public.save_net_architecture(uuid,uuid,bigint,jsonb),
 public.delete_net_architecture(uuid,uuid,bigint) to authenticated;

do $$ begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
  alter publication supabase_realtime add table public.net_architecture_updates;
 end if;
end $$;
