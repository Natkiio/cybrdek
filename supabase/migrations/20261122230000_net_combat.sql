-- #100: validate optional NET snapshots on the existing GM-only encounter path.
create function public.validate_net_combat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c jsonb; n jsonb; p jsonb; s jsonb; field text;
begin
 for c in select * from jsonb_array_elements(new.state->'combatants') loop
  if not (c ? 'net') then continue; end if;
  n := c->'net';
  if jsonb_typeof(n) is distinct from 'object' or coalesce(n->>'kind','') not in ('runner','ice','demon')
   or jsonb_typeof(n->'defId') is distinct from 'string' or jsonb_typeof(n->'deckId') is distinct from 'string'
   or not (n ? 'targetId') or jsonb_typeof(n->'targetId') not in ('string','null') then
   raise exception 'Invalid NET participant' using errcode = '23514';
  end if;
  foreach field in array array['rank','spent','actionPenalty','pendingPenalty','glue'] loop
   if jsonb_typeof(n->field) is distinct from 'number' then raise exception 'Invalid NET number' using errcode = '23514'; end if;
   if (n->>field)::numeric not between 0 and 100 or (n->>field)::numeric <> trunc((n->>field)::numeric) then
    raise exception 'Invalid NET number' using errcode = '23514'; end if;
  end loop;
  if (n->>'rank')::numeric > 10 or (n->>'glue')::numeric > 6 or (n->>'kind' = 'runner' and (n->>'rank')::numeric < 1) then
   raise exception 'Invalid Interface or hold' using errcode = '23514'; end if;
  if n->>'kind' = 'ice' and n->>'defId' not in ('asp','giant','hellhound','kraken','liche','raven','scorpion','skunk','wisp','dragon','killer','sabertooth')
   or n->>'kind' = 'demon' and n->>'defId' not in ('imp','efreet','balron') then
   raise exception 'Unknown NET security' using errcode = '23514'; end if;
  foreach field in array array['jackedIn','meat','slideUsed','fire'] loop
   if jsonb_typeof(n->field) is distinct from 'boolean' then raise exception 'Invalid NET flag' using errcode = '23514'; end if;
  end loop;
  foreach field in array array['hardware','encountered','conditions'] loop
   if jsonb_typeof(n->field) is distinct from 'array' then raise exception 'Invalid NET list' using errcode = '23514'; end if;
   if jsonb_array_length(n->field) > 200 then raise exception 'NET list too long' using errcode = '23514'; end if;
   for s in select * from jsonb_array_elements(n->field) loop
    if jsonb_typeof(s) is distinct from 'string' or char_length(s#>>'{}') > 300 then raise exception 'Invalid NET text' using errcode = '23514'; end if;
    if field = 'hardware' and s#>>'{}' not in ('backup-drive','dna-lock','hardened-circuitry','insulated-wiring','krash-barrier','range-upgrade') then
     raise exception 'Unknown hardware' using errcode = '23514'; end if;
   end loop;
  end loop;
  if jsonb_typeof(n->'programs') is distinct from 'array' then raise exception 'Invalid NET programs' using errcode = '23514'; end if;
  if jsonb_array_length(n->'programs') > 100 or (select count(*) <> count(distinct v->>'id') from jsonb_array_elements(n->'programs') v) then
   raise exception 'Invalid NET copies' using errcode = '23514'; end if;
  for p in select * from jsonb_array_elements(n->'programs') loop
   if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'id') is distinct from 'string' or char_length(p->>'id') not between 1 and 100
    or coalesce(p->>'defId','') not in ('eraser','see-ya','speedy-gonzalvez','worm','armor','flak','shield','banhammer','sword','deckkrash','hellbolt','nervescrub','poison-flatline','superglue','vrizzbolt')
    or coalesce(p->>'phase','') not in ('inactive','active','derezzed','destroyed','backup') or jsonb_typeof(p->'used') is distinct from 'boolean'
    or not (p ? 'savedPhase') or (p->'savedPhase' <> 'null'::jsonb and coalesce(p->>'savedPhase','') not in ('inactive','active','derezzed')) then
    raise exception 'Invalid NET program' using errcode = '23514'; end if;
   foreach field in array array['rez','activatedRound'] loop
    if jsonb_typeof(p->field) is distinct from 'number' then raise exception 'Invalid program number' using errcode = '23514'; end if;
    if (p->>field)::numeric <> trunc((p->>field)::numeric) then raise exception 'Invalid program number' using errcode = '23514'; end if;
   end loop;
   if (p->>'rez')::numeric not between 0 and 7 or (p->>'activatedRound')::numeric not between -1 and 100000 then
    raise exception 'Invalid program state' using errcode = '23514'; end if;
  end loop;
 end loop;
 return new;
end;
$$;
revoke all on function public.validate_net_combat() from public, anon, authenticated;
create trigger validate_encounter_net before insert or update on public.campaign_encounters for each row execute function public.validate_net_combat();

-- Retain #97's allowlist and only add a public entity classification. No deck,
-- other people’s program copies, REZ values, hardware, conditions or Interface ranks are added.
alter function public.campaign_encounter_view(uuid,uuid) rename to campaign_encounter_without_net;
revoke all on function public.campaign_encounter_without_net(uuid,uuid) from public,anon,authenticated;
create function public.campaign_encounter_view(campaign uuid, owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; item jsonb; c jsonb; p jsonb; programs jsonb; items jsonb := '[]';
begin
 result := public.campaign_encounter_without_net(campaign,owner);
 if (result->>'canManage')::boolean then return result; end if;
 for item in select * from jsonb_array_elements(result->'encounter'->'combatants') loop
  select e into c from public.campaign_encounters f, jsonb_array_elements(f.state->'combatants') e
   where f.id::text = result->>'id' and e->>'id' = item->>'id';
  if c ? 'net' then
   item := item || jsonb_build_object('netKind',c->'net'->'kind');
   if c->>'characterOwnerId' = auth.uid()::text and c->'net'->>'kind' = 'runner' then
    programs := '[]';
    for p in select * from jsonb_array_elements(c->'net'->'programs') loop
     programs := programs || jsonb_build_array(jsonb_build_object('id',p->'id','defId',p->'defId','rez',p->'rez','phase',p->'phase'));
    end loop;
    item := item || jsonb_build_object('netStatus',jsonb_build_object('jackedIn',c->'net'->'jackedIn','fire',c->'net'->'fire',
     'glue',c->'net'->'glue','programs',programs));
   end if;
   if c->'net'->>'kind' in ('ice','demon') and (c->>'hp')::numeric = 0 then
    item := item || jsonb_build_object('wound','derezzed');
   end if;
  end if;
  items := items || jsonb_build_array(item);
 end loop;
 return jsonb_set(result,'{encounter,combatants}',items);
end;
$$;
revoke all on function public.campaign_encounter_view(uuid,uuid) from public,anon,authenticated;
grant execute on function public.campaign_encounter_view(uuid,uuid) to authenticated;
