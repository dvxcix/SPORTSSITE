-- REVIEW ONLY: do not execute until the owner authorizes the 2027 launch.
-- Removes only the restrictive policies installed by the 2026 retirement;
-- original permissive policies and grants are intentionally left untouched.
do $$
declare
  table_name text;
  target oid;
begin
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);
  foreach table_name in array array[
    'games', 'hitter_affinity_matches', 'hitter_affinity_profiles', 'pitcher_affinity_matches',
    'pitcher_affinity_profiles', 'player_baserunning_season', 'player_career_stats_batting',
    'player_career_stats_pitching', 'player_fielding_season', 'player_game_log_batting',
    'player_game_log_pitching', 'player_home_run_events', 'player_pitch_arsenal',
    'player_pitch_arsenal_events', 'player_pitch_log', 'player_pitch_log_2026',
    'player_positioning', 'player_season_stats_batting', 'player_season_stats_pitching',
    'player_statcast_hitting_season', 'player_statcast_pitching_season', 'player_statcast_splits',
    'players', 'pregame_odds_snapshots'
  ] loop
    target := pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name));
    if target is null or not exists (
      select 1 from pg_catalog.pg_policy
      where polrelid = target and polname = 'mlb_offseason_admin_read' and not polpermissive and polcmd = 'r'
    ) then raise exception 'MLB reactivation preflight failed for %', table_name; end if;
  end loop;
  foreach table_name in array array[
    'posts', 'picks', 'stories', 'game_room_messages', 'groups',
    'watchlist_items', 'research_notes', 'creator_scheduled_posts'
  ] loop
    target := pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name));
    if target is null or not exists (
      select 1 from pg_catalog.pg_policy
      where polrelid = target and polname = 'mlb_offseason_mixed_read' and not polpermissive and polcmd = 'r'
    ) then raise exception 'MLB mixed reactivation preflight failed for %', table_name; end if;
  end loop;
  foreach table_name in array array[
    'games', 'hitter_affinity_matches', 'hitter_affinity_profiles', 'pitcher_affinity_matches',
    'pitcher_affinity_profiles', 'player_baserunning_season', 'player_career_stats_batting',
    'player_career_stats_pitching', 'player_fielding_season', 'player_game_log_batting',
    'player_game_log_pitching', 'player_home_run_events', 'player_pitch_arsenal',
    'player_pitch_arsenal_events', 'player_pitch_log', 'player_pitch_log_2026',
    'player_positioning', 'player_season_stats_batting', 'player_season_stats_pitching',
    'player_statcast_hitting_season', 'player_statcast_pitching_season', 'player_statcast_splits',
    'players', 'pregame_odds_snapshots'
  ] loop
    execute pg_catalog.format('drop policy mlb_offseason_admin_read on public.%I', table_name);
  end loop;
  foreach table_name in array array[
    'posts', 'picks', 'stories', 'game_room_messages', 'groups',
    'watchlist_items', 'research_notes', 'creator_scheduled_posts'
  ] loop
    execute pg_catalog.format('drop policy mlb_offseason_mixed_read on public.%I', table_name);
  end loop;
end $$;
