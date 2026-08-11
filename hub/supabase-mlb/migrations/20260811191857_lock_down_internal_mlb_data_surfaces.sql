do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    '_file_staging',
    '_filter_study',
    'alert_sent_log',
    'batter_game_logs',
    'batter_pitch_type_recent',
    'batter_platoon_ratings',
    'batter_platoon_splits',
    'batter_recent_pitch_events',
    'batter_statcast_splits',
    'batter_timing_splits',
    'builder_board_snapshot',
    'bullpen_ratings',
    'dart_picks',
    'game_outcomes',
    'game_signal_analysis',
    'game_weather',
    'manual_game_meta',
    'manual_odds',
    'manual_odds_opening',
    'mlb_schedule',
    'odds_drift_snapshots',
    'pikkit_game_data',
    'pikkit_player_markets',
    'pikkit_public_picks',
    'pitcher_pitch_type_recent',
    'pitcher_ratings',
    'pitcher_statcast_splits',
    'player_bats',
    'player_career_stats',
    'player_game_events',
    'player_game_odds',
    'player_handedness',
    'player_name_aliases',
    'player_price_season_avg',
    'pregame_odds_best',
    'projected_lineups',
    'reliever_ratings',
    'starting_pitchers'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
  end loop;
end
$$;

alter view public.hr_score_today set (security_invoker = true);
alter view public.player_signal_view set (security_invoker = true);
revoke all privileges on table public.hr_score_today from public, anon, authenticated;
revoke all privileges on table public.player_signal_view from public, anon, authenticated;
grant select on table public.hr_score_today to service_role;
grant select on table public.player_signal_view to service_role;

alter function public.get_distinct_events(timestamp with time zone, timestamp with time zone)
  set search_path = pg_catalog, public, extensions;
alter function public.get_hr_signal_openclose(text, timestamp with time zone)
  set search_path = pg_catalog, public, extensions;
alter function public.get_pikkit_game_data(text)
  set search_path = pg_catalog, public, extensions;
alter function public.run_pregame_odds_backfill(date, timestamp with time zone, timestamp with time zone)
  set search_path = pg_catalog, public, extensions;
alter function public.run_pregame_odds_backfill_v2(date, timestamp with time zone, timestamp with time zone)
  set search_path = pg_catalog, public, extensions;
alter function public.seed_today_outcomes(date)
  set search_path = pg_catalog, public, extensions;

revoke all privileges on function public.get_distinct_events(timestamp with time zone, timestamp with time zone)
  from public, anon, authenticated;
revoke all privileges on function public.get_hr_signal_openclose(text, timestamp with time zone)
  from public, anon, authenticated;
revoke all privileges on function public.get_pikkit_game_data(text)
  from public, anon, authenticated;
revoke all privileges on function public.run_pregame_odds_backfill(date, timestamp with time zone, timestamp with time zone)
  from public, anon, authenticated;
revoke all privileges on function public.run_pregame_odds_backfill_v2(date, timestamp with time zone, timestamp with time zone)
  from public, anon, authenticated;
revoke all privileges on function public.seed_today_outcomes(date)
  from public, anon, authenticated;

grant execute on function public.get_distinct_events(timestamp with time zone, timestamp with time zone) to service_role;
grant execute on function public.get_hr_signal_openclose(text, timestamp with time zone) to service_role;
grant execute on function public.get_pikkit_game_data(text) to service_role;
grant execute on function public.run_pregame_odds_backfill(date, timestamp with time zone, timestamp with time zone) to service_role;
grant execute on function public.run_pregame_odds_backfill_v2(date, timestamp with time zone, timestamp with time zone) to service_role;
grant execute on function public.seed_today_outcomes(date) to service_role;
