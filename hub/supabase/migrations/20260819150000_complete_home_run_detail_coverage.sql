-- Every canonical MLB home run must have a corresponding detail row. Savant's
-- park-detail endpoint occasionally omits an event (and can publish late), so
-- preserve the endpoint payload when it exists and materialize a provenance-
-- marked fallback from the canonical pitch ledger when it does not.

alter table public.player_home_run_events
  add column if not exists detail_source text not null default 'savant',
  add column if not exists source_result text;

update public.player_home_run_events
set source_result = result
where source_result is null;

alter table public.player_home_run_events
  drop constraint if exists player_home_run_events_detail_source_check;

alter table public.player_home_run_events
  add constraint player_home_run_events_detail_source_check
  check (detail_source in ('savant', 'canonical_pitch_log'));

create index if not exists player_home_run_events_source_season_idx
  on public.player_home_run_events (detail_source, season, game_pk, batter_id);

create or replace function public.refresh_canonical_home_run_detail_coverage(
  p_season integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fallback_rows integer := 0;
  v_canonical_rows integer := 0;
  v_covered_rows integer := 0;
begin
  -- Rebuild only provenance-marked fallback rows. A later Savant publication
  -- automatically replaces the fallback on the next run without touching any
  -- source row or canonical event.
  delete from public.player_home_run_events
  where season = p_season and detail_source = 'canonical_pitch_log';

  with canonical as (
    select
      l.game_pk::integer as game_pk,
      l.at_bat_index,
      l.pitch_number,
      l.game_date,
      l.batter_id,
      l.pitcher_id,
      l.launch_speed,
      l.launch_angle,
      l.hit_distance,
      coalesce(l.raw->>'des', l.raw->>'description', '') as event_description,
      count(*) over (partition by l.game_pk, l.batter_id) as canonical_count,
      row_number() over (
        partition by l.game_pk, l.batter_id
        order by
          (coalesce(l.raw->>'des', l.raw->>'description', '') ilike '%inside-the-park%') desc,
          ((l.launch_speed is null)::int + (l.launch_angle is null)::int + (l.hit_distance is null)::int) desc,
          l.at_bat_index,
          l.pitch_number
      ) as fallback_priority
    from public.player_pitch_log l
    where l.season = p_season and l.is_home_run
  ), savant_counts as (
    select game_pk, batter_id, count(*) as savant_count
    from public.player_home_run_events
    where season = p_season
      and detail_source = 'savant'
      and result = 'home_run'
    group by game_pk, batter_id
  ), missing as (
    select c.*,
      greatest(c.canonical_count - coalesce(s.savant_count, 0), 0) as missing_count
    from canonical c
    left join savant_counts s using (game_pk, batter_id)
  ), inserted as (
    insert into public.player_home_run_events (
      game_pk, play_id, play_url, season, game_date,
      batter_id, batter_name, pitcher_id, pitcher_name,
      result, source_result, exit_velocity, launch_angle, hr_distance,
      hr_trot, hr_cat, hr_type, parks, detail_source, last_synced_at
    )
    select
      m.game_pk,
      format('canonical:%s:%s:%s:%s', m.game_pk, m.at_bat_index, m.pitch_number, m.batter_id),
      null,
      p_season,
      m.game_date,
      m.batter_id,
      b.full_name,
      m.pitcher_id,
      p.full_name,
      'home_run',
      'home_run',
      m.launch_speed,
      m.launch_angle,
      m.hit_distance,
      null,
      'canonical_event',
      case when m.event_description ilike '%inside-the-park%' then 'inside_the_park' else null end,
      '{}'::jsonb,
      'canonical_pitch_log',
      now()
    from missing m
    join public.players b on b.mlb_id = m.batter_id
    join public.players p on p.mlb_id = m.pitcher_id
    where m.fallback_priority <= m.missing_count
    on conflict (game_pk, play_id) do update set
      game_date = excluded.game_date,
      batter_name = excluded.batter_name,
      pitcher_name = excluded.pitcher_name,
      result = excluded.result,
      source_result = excluded.source_result,
      exit_velocity = excluded.exit_velocity,
      launch_angle = excluded.launch_angle,
      hr_distance = excluded.hr_distance,
      hr_cat = excluded.hr_cat,
      hr_type = excluded.hr_type,
      parks = excluded.parks,
      detail_source = excluded.detail_source,
      last_synced_at = excluded.last_synced_at
    returning 1
  )
  select count(*) into v_fallback_rows from inserted;

  select count(*) into v_canonical_rows
  from public.player_pitch_log
  where season = p_season and is_home_run;

  with canonical_counts as (
    select game_pk::integer as game_pk, batter_id, count(*) as event_count
    from public.player_pitch_log
    where season = p_season and is_home_run
    group by game_pk, batter_id
  ), detail_counts as (
    select game_pk, batter_id, count(*) as event_count
    from public.player_home_run_events
    where season = p_season and result = 'home_run'
    group by game_pk, batter_id
  )
  select coalesce(sum(least(c.event_count, coalesce(d.event_count, 0))), 0)
  into v_covered_rows
  from canonical_counts c
  left join detail_counts d using (game_pk, batter_id);

  return jsonb_build_object(
    'season', p_season,
    'canonical_home_runs', v_canonical_rows,
    'covered_home_runs', v_covered_rows,
    'fallback_rows', v_fallback_rows,
    'missing_events', greatest(v_canonical_rows - v_covered_rows, 0)
  );
end;
$$;

revoke all on function public.refresh_canonical_home_run_detail_coverage(integer) from public, anon, authenticated;
grant execute on function public.refresh_canonical_home_run_detail_coverage(integer) to service_role;

-- Backfill the active season immediately. The cron repeats this reconciliation
-- after every Savant detail fetch, so source rows replace fallbacks over time.
select public.refresh_canonical_home_run_detail_coverage(2026);

create or replace function public.run_statcast_integrity_audit(
  p_season integer,
  p_through_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pitch jsonb;
  v_materialization jsonb;
  v_game jsonb;
  v_hr jsonb;
  v_categories jsonb;
  v_failures integer;
  v_warnings integer;
  v_status text;
  v_checks jsonb;
  v_result jsonb;
  v_window_start date := greatest(make_date(p_season, 3, 1), p_through_date - 13);
begin
  select jsonb_build_object(
    'rows', count(*),
    'games', count(distinct game_pk),
    'fair_balls', count(*) filter (where is_in_play),
    'home_runs', count(*) filter (where is_home_run),
    'classification_mismatches', count(*) filter (
      where (is_home_run and not is_in_play)
         or coalesce(events = 'home_run', false) is distinct from is_home_run
    ),
    'terminal_events_without_description', count(*) filter (where events is not null and description is null),
    'fair_balls_without_event', count(*) filter (where is_in_play and events is null),
    'source_unavailable_fair_ball_metrics', jsonb_build_object(
      'launch_speed', count(*) filter (where is_in_play and launch_speed is null),
      'launch_angle', count(*) filter (where is_in_play and launch_angle is null),
      'coordinates', count(*) filter (where is_in_play and (hc_x is null or hc_y is null)),
      'distance', count(*) filter (where is_in_play and hit_distance is null),
      'bb_type', count(*) filter (where is_in_play and bb_type is null)
    )
  ) into v_pitch
  from public.player_pitch_log
  where season = p_season and game_date <= p_through_date;

  select jsonb_build_object(
    'window_start', v_window_start,
    'window_end', p_through_date,
    'raw_to_typed_gaps', jsonb_build_object(
      'pitch_type', count(*) filter (where nullif(raw->>'pitch_type', '') is not null and pitch_type is null),
      'velocity', count(*) filter (where nullif(raw->>'release_speed', '') is not null and velocity is null),
      'spin_rate', count(*) filter (where nullif(raw->>'release_spin_rate', '') is not null and spin_rate is null),
      'pfx_x', count(*) filter (where nullif(raw->>'pfx_x', '') is not null and pfx_x is null),
      'pfx_z', count(*) filter (where nullif(raw->>'pfx_z', '') is not null and pfx_z is null),
      'zone', count(*) filter (where nullif(raw->>'zone', '') is not null and zone is null),
      'events', count(*) filter (where nullif(raw->>'events', '') is not null and events is null),
      'description', count(*) filter (where nullif(raw->>'description', '') is not null and description is null),
      'launch_speed', count(*) filter (where nullif(raw->>'launch_speed', '') is not null and launch_speed is null),
      'launch_angle', count(*) filter (where nullif(raw->>'launch_angle', '') is not null and launch_angle is null),
      'xwoba', count(*) filter (where nullif(raw->>'estimated_woba_using_speedangle', '') is not null and xwoba is null),
      'bat_speed', count(*) filter (where nullif(raw->>'bat_speed', '') is not null and bat_speed is null),
      'plate_x', count(*) filter (where nullif(raw->>'plate_x', '') is not null and plate_x is null),
      'plate_z', count(*) filter (where nullif(raw->>'plate_z', '') is not null and plate_z is null),
      'attack_angle', count(*) filter (where nullif(raw->>'attack_angle', '') is not null and attack_angle is null),
      'swing_length', count(*) filter (where nullif(raw->>'swing_length', '') is not null and swing_length is null),
      'swing_path_tilt', count(*) filter (where nullif(raw->>'swing_path_tilt', '') is not null and swing_path_tilt is null),
      'attack_direction', count(*) filter (where nullif(raw->>'attack_direction', '') is not null and attack_direction is null),
      'launch_speed_angle', count(*) filter (where nullif(raw->>'launch_speed_angle', '') is not null and launch_speed_angle is null),
      'hc_x', count(*) filter (where nullif(raw->>'hc_x', '') is not null and hc_x is null),
      'hc_y', count(*) filter (where nullif(raw->>'hc_y', '') is not null and hc_y is null),
      'hit_distance', count(*) filter (where nullif(raw->>'hit_distance_sc', '') is not null and hit_distance is null),
      'bb_type', count(*) filter (where nullif(raw->>'bb_type', '') is not null and bb_type is null)
    )
  ) into v_materialization
  from public.player_pitch_log
  where season = p_season and game_date between v_window_start and p_through_date;

  with pitch_games as (
    select game_pk, count(*) as pitch_count
    from public.player_pitch_log
    where season = p_season and game_date <= p_through_date
    group by game_pk
  )
  select jsonb_build_object(
    'scheduled_games', count(*),
    'scheduled_games_without_pitch_log', count(*) filter (where pg.game_pk is null),
    'games_with_suspiciously_short_pitch_log', count(*) filter (where pg.pitch_count between 1 and 99)
  ) into v_game
  from public.games g
  left join pitch_games pg on pg.game_pk = g.game_pk
  where g.season = p_season and g.game_type = 'R' and g.game_date <= p_through_date;

  with pitch_hr as (
    select game_pk::integer as game_pk, batter_id, count(*) as event_count,
           count(*) filter (where coalesce(raw->>'des', raw->>'description', '') ilike '%inside-the-park%') as inside_park_count
    from public.player_pitch_log
    where season = p_season and game_date <= p_through_date and is_home_run
    group by game_pk, batter_id
  ), detail_hr as (
    select game_pk, batter_id,
           count(*) filter (where result = 'home_run') as event_count,
           count(*) filter (where result = 'home_run' and detail_source = 'savant') as savant_count,
           count(*) filter (where result = 'home_run' and detail_source = 'canonical_pitch_log') as fallback_count
    from public.player_home_run_events
    where season = p_season and game_date <= p_through_date
    group by game_pk, batter_id
  )
  select jsonb_build_object(
    'canonical_home_runs', coalesce(sum(ph.event_count), 0),
    'covered_home_runs', coalesce(sum(least(ph.event_count, coalesce(dh.event_count, 0))), 0),
    'savant_detail_home_runs', coalesce(sum(least(ph.event_count, coalesce(dh.savant_count, 0))), 0),
    'canonical_fallback_home_runs', coalesce(sum(least(ph.event_count, coalesce(dh.fallback_count, 0))), 0),
    'missing_detail_events', coalesce(sum(greatest(ph.event_count - coalesce(dh.event_count, 0), 0)), 0),
    'inside_the_park_events', coalesce(sum(ph.inside_park_count), 0)
  ) into v_hr
  from pitch_hr ph
  left join detail_hr dh using (game_pk, batter_id);

  with category_health as (
    select entity_id, last_synced_at
    from public.sync_state
    where season = p_season and source = 'savant_csv'
      and entity_type = 'savant_category' and entity_id like '%:%'
  )
  select jsonb_build_object(
    'tracked_categories', count(*),
    'stale_categories', count(*) filter (where last_synced_at < now() - interval '2 days'),
    'oldest_sync', min(last_synced_at),
    'newest_sync', max(last_synced_at)
  ) into v_categories
  from category_health;

  select coalesce(sum(value::integer), 0)
  into v_failures
  from jsonb_each_text(v_materialization->'raw_to_typed_gaps');

  v_failures := v_failures
    + coalesce((v_pitch->>'classification_mismatches')::integer, 0)
    + coalesce((v_pitch->>'terminal_events_without_description')::integer, 0)
    + coalesce((v_pitch->>'fair_balls_without_event')::integer, 0)
    + coalesce((v_hr->>'missing_detail_events')::integer, 0)
    + coalesce((v_categories->>'stale_categories')::integer, 0);

  v_warnings := coalesce((v_game->>'scheduled_games_without_pitch_log')::integer, 0)
    + coalesce((v_game->>'games_with_suspiciously_short_pitch_log')::integer, 0);
  v_status := case when v_failures > 0 then 'failed' when v_warnings > 0 then 'warning' else 'healthy' end;
  v_pitch := v_pitch || jsonb_build_object('raw_to_typed_gaps', v_materialization->'raw_to_typed_gaps');
  v_checks := jsonb_build_object(
    'pitch_log', v_pitch,
    'materialization_window', jsonb_build_object('start', v_window_start, 'end', p_through_date),
    'game_coverage', v_game,
    'home_run_enrichment', v_hr,
    'category_freshness', v_categories
  );

  insert into public.statcast_integrity_runs (season, through_date, status, summary, checks)
  values (p_season, p_through_date, v_status, jsonb_build_object('failures', v_failures, 'warnings', v_warnings), v_checks)
  returning jsonb_build_object(
    'id', id, 'season', season, 'through_date', through_date, 'status', status,
    'summary', summary, 'checks', checks, 'created_at', created_at
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.run_statcast_integrity_audit(integer, date) from public, anon, authenticated;
grant execute on function public.run_statcast_integrity_audit(integer, date) to service_role;
