-- Supabase opens everything new in public to anon and authenticated by default
-- (all table rights, execute on every function). Earlier migrations granted
-- narrower rights without revoking that default, so on the live project:
--   * a GM could change any column of their campaign (meant: name only), e.g. is_public;
--   * a player could set campaign_id on their own character directly, skipping
--     set_character_campaign's membership check, or insert with any updated_at;
--   * anon held write rights everywhere (RLS still refused every write) and could
--     call functions meant for signed-in players (each still refused).
-- RLS kept every row private; this makes the grants say what was intended.
-- tests/db now apply Supabase's defaults first, so this is tested as it runs live.

-- Tables: back to nothing, then exactly what earlier migrations meant to grant.
revoke all on
	public.gms, public.lore_entries, public.map_pins, public.map_districts,
	public.campaigns, public.campaign_members, public.campaign_invites,
	public.characters, public.character_versions
from anon, authenticated;

grant select on public.lore_entries, public.map_pins, public.map_districts, public.campaigns to anon, authenticated;
grant insert, update, delete on public.lore_entries, public.map_pins, public.map_districts to authenticated;
grant update (name) on public.campaigns to authenticated;
grant select, delete on public.campaign_members to authenticated;
grant select on public.campaign_invites to authenticated;
grant select on public.characters, public.character_versions to authenticated;
grant insert (id, data, updated_at, deleted_at) on public.characters to authenticated;
grant update (data, updated_at, deleted_at) on public.characters to authenticated;

-- Functions: same. Postgres also lets PUBLIC (everyone) run every new function,
-- so that goes too. Trigger functions need no grant to run as triggers.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
	public.is_gm(), public.is_campaign_gm(uuid), public.is_campaign_member(uuid), public.can_read_campaign(uuid)
to anon, authenticated;
grant execute on function
	public.create_campaign(text), public.join_campaign(text),
	public.can_gm_read_character(uuid, uuid), public.set_character_campaign(text, uuid),
	public.save_character(uuid, text, jsonb, bigint, bigint), public.my_characters(uuid)
to authenticated;

-- From now on nothing new is open by default: each migration grants what it needs.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
