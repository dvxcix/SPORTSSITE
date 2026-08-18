-- NULL event labels are normal for non-terminal pitches. Coalesce the
-- comparison so only a real disagreement with the materialized HR flag fails.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.run_statcast_integrity_audit(integer,date)'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    '(events = ''home_run'') is distinct from is_home_run',
    'coalesce(events = ''home_run'', false) is distinct from is_home_run'
  );
  execute v_definition;
end;
$$;

