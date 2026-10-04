-- Empty/stale Savant leaderboard publications are upstream availability,
-- not corruption of the canonical pitch/event ledger. Keep them visible as
-- warnings while reserving audit failures for actionable data gaps.
do $$
declare
  v_definition text;
  v_old_failures text := $needle$v_failures := v_failures
    + coalesce((v_pitch->>'classification_mismatches')::integer, 0)
    + coalesce((v_pitch->>'terminal_events_without_description')::integer, 0)
    + coalesce((v_pitch->>'fair_balls_without_event')::integer, 0)
    + coalesce((v_hr->>'missing_detail_events')::integer, 0)
    + coalesce((v_categories->>'stale_categories')::integer, 0);$needle$;
  v_new_failures text := $replacement$v_failures := v_failures
    + coalesce((v_pitch->>'classification_mismatches')::integer, 0)
    + coalesce((v_pitch->>'terminal_events_without_description')::integer, 0)
    + coalesce((v_pitch->>'fair_balls_without_event')::integer, 0)
    + coalesce((v_hr->>'missing_detail_events')::integer, 0);$replacement$;
  v_old_warnings text := $needle$v_warnings := coalesce((v_game->>'scheduled_games_without_pitch_log')::integer, 0)
    + coalesce((v_game->>'games_with_suspiciously_short_pitch_log')::integer, 0);$needle$;
  v_new_warnings text := $replacement$v_warnings := coalesce((v_game->>'scheduled_games_without_pitch_log')::integer, 0)
    + coalesce((v_game->>'games_with_suspiciously_short_pitch_log')::integer, 0)
    + coalesce((v_categories->>'stale_categories')::integer, 0);$replacement$;
begin
  select pg_get_functiondef('public.run_statcast_integrity_audit(integer,date)'::regprocedure)
    into v_definition;

  if position(v_old_failures in v_definition) = 0 or position(v_old_warnings in v_definition) = 0 then
    raise exception 'run_statcast_integrity_audit definition did not match the expected production version';
  end if;

  v_definition := replace(v_definition, v_old_failures, v_new_failures);
  v_definition := replace(v_definition, v_old_warnings, v_new_warnings);
  execute v_definition;
end;
$$;
