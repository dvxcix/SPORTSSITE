-- Materialize the four Savant batted-ball fields used by player spray
-- charts. They already exist in raw JSONB for historical rows; real columns
-- avoid detoasting every pitch payload whenever a member opens a chart.
alter table public.player_pitch_log
  add column if not exists hc_x double precision,
  add column if not exists hc_y double precision,
  add column if not exists hit_distance double precision,
  add column if not exists bb_type text;

update public.player_pitch_log
set
  hc_x = case
    when nullif(raw ->> 'hc_x', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (raw ->> 'hc_x')::double precision
    else null
  end,
  hc_y = case
    when nullif(raw ->> 'hc_y', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (raw ->> 'hc_y')::double precision
    else null
  end,
  hit_distance = case
    when nullif(raw ->> 'hit_distance_sc', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (raw ->> 'hit_distance_sc')::double precision
    else null
  end,
  bb_type = nullif(raw ->> 'bb_type', '')
where is_in_play
  and (hc_x is null or hc_y is null or hit_distance is null or bb_type is null);

create index if not exists player_pitch_log_batter_spray_idx
  on public.player_pitch_log (batter_id, game_date desc)
  include (game_pk, pitcher_id, events, is_home_run, launch_speed, launch_angle, hc_x, hc_y, hit_distance, bb_type)
  where is_in_play and hc_x is not null and hc_y is not null;

create index if not exists player_pitch_log_pitcher_spray_idx
  on public.player_pitch_log (pitcher_id, game_date desc)
  include (game_pk, batter_id, events, is_home_run, launch_speed, launch_angle, hc_x, hc_y, hit_distance, bb_type)
  where is_in_play and hc_x is not null and hc_y is not null;
