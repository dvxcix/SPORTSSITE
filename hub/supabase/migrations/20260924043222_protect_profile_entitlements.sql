-- Profiles remain readable as before; RLS still limits edits to the owner.
-- Signup/onboarding, billing and admin role changes use trusted service clients.
-- Remove table grants AND any prior column grants: either can authorize a write.
revoke insert, update, delete, truncate, references, trigger on public.users from public, anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ') into cols
  from pg_attribute where attrelid = 'public.users'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%s), update (%s), references (%s) on public.users from public, anon, authenticated', cols, cols, cols);
end;
$$;

grant update (
  username, display_name, bio, avatar_url, banner_url,
  avatar_ring_style, avatar_ring_color, sport_preferences,
  favorite_sports, favorite_teams, favorite_players, social_links,
  sportsbooks, website, twitter_handle, location, is_private,
  hide_win_rate, allow_dms, notification_settings,
  notification_delivery_settings, interest_settings, dugout_column_prefs,
  updated_at
) on public.users to authenticated;

-- No row, membership, role or existing RLS policy is modified.
-- New columns are non-writable by default. Do not restore table-level UPDATE.
notify pgrst, 'reload schema';
