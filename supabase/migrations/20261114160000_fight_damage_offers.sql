-- #70 follow-up: owner-initiated carry-over, never a GM write to a private sheet.
-- The RPC only offers finished, server-recorded damage for the authenticated
-- owner's characters. The device applies a chosen offer with its own sync path.
create function public.campaign_damage_offers(campaign uuid, owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
	if owner is null or owner is distinct from auth.uid() or not public.is_campaign_member(campaign) then
		raise exception 'Campaign membership required' using errcode = '42501';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('encounterId', offers.id, 'characterId', offers.character_id,
			'name', offers.name, 'damage', offers.damage, 'endedAt', offers.ended_at) order by offers.ended_at, offers.id)
		from (
			select e.id, e.ended_at, c->>'characterId' as character_id, c->>'name' as name,
				greatest(0, round(coalesce((c->>'startingHp')::numeric, (c->>'hp')::numeric) - (c->>'hp')::numeric))::int as damage
			from public.campaign_encounters e cross join lateral jsonb_array_elements(e.state->'combatants') c
			join public.characters ch on ch.user_id = owner and ch.id = c->>'characterId' and ch.deleted_at is null
			where e.campaign_id = campaign and e.ended_at is not null and c->>'characterOwnerId' = owner::text
			and not (coalesce(ch.data->'extra'->'acceptedChanges','{}') ? ('fight-damage:' || owner::text || ':' || e.id::text))
		) offers where offers.damage > 0
	), '[]'::jsonb);
end;
$$;
revoke all on function public.campaign_damage_offers(uuid,uuid) from public, anon, authenticated;
grant execute on function public.campaign_damage_offers(uuid,uuid) to authenticated;
