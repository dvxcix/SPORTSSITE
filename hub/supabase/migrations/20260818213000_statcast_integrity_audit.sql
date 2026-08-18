-- Full-season Statcast provenance audit. The pitch log is the canonical
-- event ledger; optional Savant HR-detail rows enrich it but never replace it.

create table if not exists public.statcast_integrity_runs (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  through_date date not null,
  status text not null check (status in ('healthy', 'warning', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists statcast_integrity_runs_created_idx
  on public.statcast_integrity_runs (created_at desc);

alter table public.statcast_integrity_runs enable row level security;
revoke all on public.statcast_integrity_runs from anon, authenticated;
grant all on public.statcast_integrity_runs to service_role;

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
  v_game jsonb;
  v_hr jsonb;
  v_categories jsonb;
  v_failures integer;
  v_warnings integer;
  v_status text;
  v_checks jsonb;
  v_result jsonb;
begin
  with scoped as materialized (
    select *
    from public.player_pitch_log
    where season = p_season and game_date <= p_through_date
  )
  select jsonb_build_object(
    'rows', count(*),
    'games', count(distinct game_pk),
    'fair_balls', count(*) filter (where is_in_play),
    'home_runs', count(*) filter (where is_home_run),
    'classification_mismatches', count(*) filter (
      where (coalesce(raw->>'type', '') = 'X') is distinct from is_in_play
         or (coalesce(raw->>'events', '') = 'home_run') is distinct from is_home_run
         or (is_home_run and not is_in_play)
    ),
    'terminal_events_without_description', count(*) filter (
      where events is not null and description is null
    ),
    'fair_balls_without_event', count(*) filter (
      where is_in_play and events is null
    ),
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
    ),
    'source_unavailable_fair_ball_metrics', jsonb_build_object(
      'launch_speed', count(*) filter (where is_in_play and nullif(raw->>'launch_speed', '') is null),
      'launch_angle', count(*) filter (where is_in_play and nullif(raw->>'launch_angle', '') is null),
      'coordinates', count(*) filter (where is_in_play and (nullif(raw->>'hc_x', '') is null or nullif(raw->>'hc_y', '') is null)),
      'distance', count(*) filter (where is_in_play and nullif(raw->>'hit_distance_sc', '') is null),
      'bb_type', count(*) filter (where is_in_play and nullif(raw->>'bb_type', '') is null)
    )
  ) into v_pitch
  from scoped;

  with actual_games as (
    select distinct game_pk
    from public.player_game_log_batting
    where season = p_season and game_date <= p_through_date
    union
    select distinct game_pk
    from public.player_game_log_pitching
    where season = p_season and game_date <= p_through_date
  ), pitch_games as (
    select game_pk, count(*) as pitch_count
    from public.player_pitch_log
    where season = p_season and game_date <= p_through_date
    group by game_pk
  )
  select jsonb_build_object(
    'actual_games', count(*),
    'actual_games_without_pitch_log', count(*) filter (where pg.game_pk is null),
    'games_with_suspiciously_short_pitch_log', count(*) filter (where pg.pitch_count between 1 and 99)
  ) into v_game
  from actual_games ag
  left join pitch_games pg on pg.game_pk = ag.game_pk;

  with pitch_hr as (
    select game_pk::integer as game_pk, batter_id, count(*) as event_count,
           count(*) filter (where coalesce(raw->>'des', raw->>'description', '') ilike '%inside-the-park%') as inside_park_count
    from public.player_pitch_log
    where season = p_season and game_date <= p_through_date and is_home_run
    group by game_pk, batter_id
  ), detail_hr as (
    select game_pk, batter_id, count(*) as event_count
    from public.player_home_run_events
    where season = p_season and game_date <= p_through_date and result = 'home_run'
    group by game_pk, batter_id
  )
  select jsonb_build_object(
    'canonical_home_runs', coalesce(sum(ph.event_count), 0),
    'optional_detail_home_runs', coalesce(sum(least(ph.event_count, coalesce(dh.event_count, 0))), 0),
    'missing_optional_detail_events', coalesce(sum(greatest(ph.event_count - coalesce(dh.event_count, 0), 0)), 0),
    'inside_the_park_events', coalesce(sum(ph.inside_park_count), 0)
  ) into v_hr
  from pitch_hr ph
  left join detail_hr dh using (game_pk, batter_id);

  with category_health as (
    select entity_id, last_synced_at
    from public.sync_state
    where season = p_season
      and source = 'savant_csv'
      and entity_type = 'savant_category'
      and entity_id like '%:%'
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
  from jsonb_each_text(v_pitch->'raw_to_typed_gaps');

  v_failures := v_failures
    + coalesce((v_pitch->>'classification_mismatches')::integer, 0)
    + coalesce((v_pitch->>'terminal_events_without_description')::integer, 0)
    + coalesce((v_pitch->>'fair_balls_without_event')::integer, 0)
    + coalesce((v_game->>'actual_games_without_pitch_log')::integer, 0)
    + coalesce((v_categories->>'stale_categories')::integer, 0);

  v_warnings := coalesce((v_game->>'games_with_suspiciously_short_pitch_log')::integer, 0)
    + coalesce((v_hr->>'missing_optional_detail_events')::integer, 0);
  v_status := case when v_failures > 0 then 'failed' when v_warnings > 0 then 'warning' else 'healthy' end;
  v_checks := jsonb_build_object(
    'pitch_log', v_pitch,
    'game_coverage', v_game,
    'home_run_enrichment', v_hr,
    'category_freshness', v_categories
  );

  insert into public.statcast_integrity_runs (season, through_date, status, summary, checks)
  values (
    p_season,
    p_through_date,
    v_status,
    jsonb_build_object('failures', v_failures, 'warnings', v_warnings),
    v_checks
  )
  returning jsonb_build_object(
    'id', id,
    'season', season,
    'through_date', through_date,
    'status', status,
    'summary', summary,
    'checks', checks,
    'created_at', created_at
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.run_statcast_integrity_audit(integer, date) from public, anon, authenticated;
grant execute on function public.run_statcast_integrity_audit(integer, date) to service_role;

-- Historical imports previously materialized distance only for fair balls and
-- omitted three source-provided bb_type values. Preserve every source value,
-- including tracked foul-ball distance, without inventing missing metrics.
update public.player_pitch_log
set
  hit_distance = coalesce(
    hit_distance,
    case when nullif(raw->>'hit_distance_sc', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      then (raw->>'hit_distance_sc')::double precision end
  ),
  bb_type = coalesce(bb_type, nullif(raw->>'bb_type', ''))
where season = 2026
  and (
    (hit_distance is null and nullif(raw->>'hit_distance_sc', '') is not null)
    or (bb_type is null and nullif(raw->>'bb_type', '') is not null)
  );

