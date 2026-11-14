-- Cleanup promised in 20261105100000_campaigns.sql, now that every client sends
-- a campaign_id.
--
-- 1. No more "default to Voyage City": the default only kept the pre-campaign
--    app working during the switch. A stale cached copy of that app now gets an
--    error instead of quietly writing into Voyage City.
alter table public.lore_entries alter column campaign_id drop default;
alter table public.map_pins alter column campaign_id drop default;
alter table public.map_districts alter column campaign_id drop default;

-- 2. public.gms / is_gm() stay, with a new job: they mark the app's admin, who
--    can issue password reset codes (20261110100000_password_resets.sql). No
--    policy uses them any more, and people signed out never need to ask.
comment on table public.gms is 'The app''s admins (by email): can issue password reset codes. Managed by hand (SQL), never from the app.';
comment on function public.is_gm() is 'True when the signed-in user is an app admin (an email in public.gms).';
revoke execute on function public.is_gm() from anon;
