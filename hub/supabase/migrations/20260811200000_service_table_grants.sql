-- Defense in depth for tables that are exclusively accessed through trusted
-- server clients or SECURITY DEFINER RPCs. RLS already denies browser access,
-- but removing PostgREST grants also prevents a future policy change from
-- accidentally publishing internal operational data.
revoke all on table public.allstar_event_markets from anon, authenticated;
revoke all on table public.daily_featured_game from anon, authenticated;
revoke all on table public.discord_config from anon, authenticated;
revoke all on table public.dugout_matchup_edge_precomputed from anon, authenticated;
revoke all on table public.dugout_pitchlog_stat_precomputed from anon, authenticated;
revoke all on table public.dugout_season_avg_precomputed from anon, authenticated;
revoke all on table public.dugout_statcast_precomputed from anon, authenticated;
revoke all on table public.fanduel_gap_odds from anon, authenticated;
revoke all on table public.fanduel_gap_odds_opening from anon, authenticated;
revoke all on table public.game_status_state from anon, authenticated;
revoke all on table public.hr_alert_state from anon, authenticated;
revoke all on table public.lineup_confirmation_state from anon, authenticated;
revoke all on table public.market_opening_prices from anon, authenticated;
revoke all on table public.matrices from anon, authenticated;
revoke all on table public.matrix_factors from anon, authenticated;
revoke all on table public.matrix_pipeline_steps from anon, authenticated;
revoke all on table public.mgm_gap_odds from anon, authenticated;
revoke all on table public.mgm_gap_odds_opening from anon, authenticated;
revoke all on table public.near_hr_alert_cursor from anon, authenticated;
revoke all on table public.nfl_dvp from anon, authenticated;
revoke all on table public.nfl_ngs_passing from anon, authenticated;
revoke all on table public.nfl_ngs_receiving from anon, authenticated;
revoke all on table public.nfl_ngs_rushing from anon, authenticated;
revoke all on table public.nfl_pbp from anon, authenticated;
revoke all on table public.nfl_player_stats from anon, authenticated;
revoke all on table public.nfl_players from anon, authenticated;
revoke all on table public.nfl_schedule from anon, authenticated;
revoke all on table public.nfl_teams from anon, authenticated;
revoke all on table public.pregame_odds_snapshot_history from anon, authenticated;
revoke all on table public.pro_plan_payout_runs from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.rate_limit_counters from anon, authenticated;
revoke all on table public.scrape_dispatch_queue from anon, authenticated;
revoke all on table public.scratch_backtest_features from anon, authenticated;
revoke all on table public.scratch_trailing_rates from anon, authenticated;
revoke all on table public.sync_state from anon, authenticated;
