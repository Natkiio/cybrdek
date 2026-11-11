-- SY-1 (#52): a player places their own character in a campaign they belong to,
-- which is what lets that campaign's GM read it. Null takes it back out.
create function public.set_character_campaign(character_id text, campaign uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
	if auth.uid() is null then
		raise exception 'Sign in first' using errcode = '42501';
	end if;
	if campaign is not null and not public.is_campaign_member(campaign) then
		raise exception 'Join that campaign first' using errcode = '42501';
	end if;
	update public.characters set campaign_id = campaign
	where user_id = auth.uid() and id = character_id and deleted_at is null;
	if not found then
		raise exception 'That character is not in your account' using errcode = 'P0002';
	end if;
end;
$$;
revoke all on function public.set_character_campaign(text, uuid) from public;
grant execute on function public.set_character_campaign(text, uuid) to authenticated;
