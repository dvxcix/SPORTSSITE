-- Historical Statcast payloads already contain these fields in `raw`, but
-- rows ingested before materialization was introduced left the typed columns
-- empty. Backfill the production query columns without changing source data.
update public.player_pitch_log
set
  attack_angle = coalesce(attack_angle, nullif(raw->>'attack_angle', '')::double precision),
  swing_length = coalesce(swing_length, nullif(raw->>'swing_length', '')::double precision),
  swing_path_tilt = coalesce(swing_path_tilt, nullif(raw->>'swing_path_tilt', '')::double precision),
  attack_direction = coalesce(attack_direction, nullif(raw->>'attack_direction', '')::double precision),
  launch_speed_angle = coalesce(launch_speed_angle, nullif(raw->>'launch_speed_angle', '')::smallint)
where season = 2026
  and (
    (attack_angle is null and nullif(raw->>'attack_angle', '') is not null)
    or (swing_length is null and nullif(raw->>'swing_length', '') is not null)
    or (swing_path_tilt is null and nullif(raw->>'swing_path_tilt', '') is not null)
    or (attack_direction is null and nullif(raw->>'attack_direction', '') is not null)
    or (launch_speed_angle is null and nullif(raw->>'launch_speed_angle', '') is not null)
  );
