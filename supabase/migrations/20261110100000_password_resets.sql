-- Forgotten passwords, with no email (see the login plan): the app's admin
-- (an email in public.gms) issues a one-time code for a player and passes it on
-- themselves. The player enters it with a new password; the reset-password
-- Edge Function checks it here and sets the password through Supabase's admin API.
--
-- Only the admin can issue codes, not a campaign GM: anyone can make a
-- campaign, and a code is enough to take over an account.

create table public.password_resets (
	user_id uuid primary key references auth.users (id) on delete cascade, -- one live code each
	code_hash text not null, -- sha256 of the code; the code itself is never stored
	expires_at timestamptz not null,
	attempts int not null default 0
);
-- RLS on, no policies, no grants: only the functions below touch it.
alter table public.password_resets enable row level security;

-- Codes look like 3F9A-0C21-B7E4: 48 random bits, uppercase hex, so no
-- letters to confuse (no O or I). Five wrong tries or 30 minutes and it's gone.
create function public.reset_code_hash(code text)
returns text language sql immutable set search_path = '' as $$
	select encode(sha256(convert_to(regexp_replace(upper(code), '[^0-9A-F]', '', 'g'), 'UTF8')), 'hex');
$$;
revoke all on function public.reset_code_hash(text) from public;

create function public.issue_password_reset(player_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
	player uuid;
	raw text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
	code text := substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4);
begin
	if not public.is_gm() then
		raise exception 'Only the app admin can issue reset codes.' using errcode = '42501';
	end if;
	select id into player from auth.users where lower(email) = lower(btrim(player_email));
	if player is null then
		raise exception 'No account uses that email.' using errcode = 'P0002';
	end if;
	insert into public.password_resets (user_id, code_hash, expires_at)
	values (player, public.reset_code_hash(code), now() + interval '30 minutes')
	on conflict (user_id) do update
	set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0;
	return code;
end;
$$;
revoke all on function public.issue_password_reset(text) from public;
grant execute on function public.issue_password_reset(text) to authenticated;

-- Used by the Edge Function only (service_role). Returns the player's id and
-- spends the code if it's right; otherwise null, counting a wrong try.
create function public.claim_password_reset(player_email text, code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
	player uuid;
	pending public.password_resets;
begin
	select id into player from auth.users where lower(email) = lower(btrim(player_email));
	if player is null then
		return null;
	end if;
	select * into pending from public.password_resets where user_id = player for update;
	if not found then
		return null;
	end if;
	if pending.expires_at < now() or pending.attempts >= 5 then
		delete from public.password_resets where user_id = player;
		return null;
	end if;
	-- IS DISTINCT FROM, not <>: a null code must count as wrong, never as a match.
	if code is null or pending.code_hash is distinct from public.reset_code_hash(code) then
		update public.password_resets set attempts = attempts + 1 where user_id = player;
		return null;
	end if;
	delete from public.password_resets where user_id = player;
	return player;
end;
$$;
revoke all on function public.claim_password_reset(text, text) from public, anon, authenticated;
-- service_role always exists on Supabase; the check only spares test databases
-- that don't create it.
do $$ begin
	if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
		grant execute on function public.claim_password_reset(text, text) to service_role;
	end if;
end $$;
