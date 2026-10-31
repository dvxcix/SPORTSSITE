-- Temporary 2026–27 retirement. Do not alter existing policies or grants:
-- each extra restrictive SELECT policy can be removed individually for 2027.
-- service_role retains its existing BYPASSRLS and privileges.
do $$
declare
  item record;
  target oid;
  expected_partition oid;
begin
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);

  if not pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_type', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_type', 'UPDATE')
     or pg_catalog.has_column_privilege('anon', 'public.users', 'account_type', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_type', 'INSERT')
     or pg_catalog.has_column_privilege('anon', 'public.users', 'account_type', 'INSERT')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role' and rolbypassrls)
  then raise exception 'MLB off-season preflight: admin identity grants changed'; end if;

  expected_partition := pg_catalog.to_regclass('public.player_pitch_log_2026');
  if expected_partition is null or not exists (
    select 1 from pg_catalog.pg_inherits
    where inhparent = pg_catalog.to_regclass('public.player_pitch_log') and inhrelid = expected_partition
  ) or (select count(*) from pg_catalog.pg_inherits where inhparent = pg_catalog.to_regclass('public.player_pitch_log')) <> 1
  then raise exception 'MLB off-season preflight: pitch-log partitions changed'; end if;

  for item in select * from (values
    ('games', 'games are publicly readable'),
    ('hitter_affinity_matches', 'hitter affinity matches are publicly readable'),
    ('hitter_affinity_profiles', 'hitter affinity profiles are publicly readable'),
    ('pitcher_affinity_matches', 'pitcher affinity matches are publicly readable'),
    ('pitcher_affinity_profiles', 'pitcher affinity profiles are publicly readable'),
    ('player_baserunning_season', 'Anyone can read player baserunning season'),
    ('player_career_stats_batting', 'Anyone can read player career batting stats'),
    ('player_career_stats_pitching', 'Anyone can read player career pitching stats'),
    ('player_fielding_season', 'Anyone can read player fielding season'),
    ('player_game_log_batting', 'Anyone can read player game log batting'),
    ('player_game_log_pitching', 'Anyone can read player game log pitching'),
    ('player_home_run_events', 'Anyone can read player_home_run_events'),
    ('player_pitch_arsenal', 'Anyone can read player pitch arsenal'),
    ('player_pitch_arsenal_events', 'Anyone can read player_pitch_arsenal_events'),
    ('player_pitch_log', 'Anyone can read player pitch log'),
    ('player_pitch_log_2026', 'Anyone can read player pitch log'),
    ('player_positioning', 'Anyone can read player positioning'),
    ('player_season_stats_batting', 'Anyone can read player season batting stats'),
    ('player_season_stats_pitching', 'Anyone can read player season pitching stats'),
    ('player_statcast_hitting_season', 'Anyone can read player statcast hitting season'),
    ('player_statcast_pitching_season', 'Anyone can read player statcast pitching season'),
    ('player_statcast_splits', 'Anyone can read player statcast splits'),
    ('players', 'Anyone can read players'),
    ('pregame_odds_snapshots', 'Anyone can read pregame odds snapshots')
  ) as entries(table_name, expected_policy) loop
    target := pg_catalog.to_regclass(pg_catalog.format('public.%I', item.table_name));
    if target is null or not exists (
      select 1 from pg_catalog.pg_class where oid = target and relkind in ('r', 'p') and relrowsecurity
    ) or not pg_catalog.has_table_privilege('anon', target, 'SELECT')
      or not pg_catalog.has_table_privilege('authenticated', target, 'SELECT')
      or not pg_catalog.has_table_privilege('service_role', target, 'SELECT')
      or (select count(*) from pg_catalog.pg_policy where polrelid = target and polcmd in ('r', '*')) <> 1
      or not exists (
        select 1 from pg_catalog.pg_policy where polrelid = target and polname = item.expected_policy
          and polcmd = 'r' and polpermissive and polroles = array[0::oid]
          and pg_catalog.pg_get_expr(polqual, polrelid) = 'true'
      )
    then raise exception 'MLB off-season preflight: policy or grant changed for %', item.table_name; end if;
  end loop;

  for item in select unnest(array[
    'games', 'hitter_affinity_matches', 'hitter_affinity_profiles', 'pitcher_affinity_matches',
    'pitcher_affinity_profiles', 'player_baserunning_season', 'player_career_stats_batting',
    'player_career_stats_pitching', 'player_fielding_season', 'player_game_log_batting',
    'player_game_log_pitching', 'player_home_run_events', 'player_pitch_arsenal',
    'player_pitch_arsenal_events', 'player_pitch_log', 'player_pitch_log_2026',
    'player_positioning', 'player_season_stats_batting', 'player_season_stats_pitching',
    'player_statcast_hitting_season', 'player_statcast_pitching_season', 'player_statcast_splits',
    'players', 'pregame_odds_snapshots'
  ]) as table_name loop
    execute pg_catalog.format(
      'create policy mlb_offseason_admin_read on public.%I as restrictive for select to anon, authenticated using ((select exists (select 1 from public.users where id = (select auth.uid()) and account_type = ''admin'')))',
      item.table_name
    );
  end loop;
end $$;
