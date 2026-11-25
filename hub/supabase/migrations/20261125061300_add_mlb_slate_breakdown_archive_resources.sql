-- Add native Slate Breakdown observations to the original per-game clock.
-- Apply this migration individually. It does not write or replay observations.
do $migration$
declare
  old_pattern constant text := '^(board:v1|pitchlog:\d+|pitcher-window:\d+:([1-9]|10))$';
  new_pattern constant text := '^(board:v1|pitchlog:\d+|pitcher-window:\d+:([1-9]|10)|slate-(batter|starter|team):[1-9][0-9]{0,6})$';
  old_rows_guard constant text := 'p_resource like ''pitchlog:%''';
  new_rows_guard constant text := '(p_resource like ''pitchlog:%'' or p_resource ~ ''^slate-(batter|starter):'')';
  routine regprocedure;
  definition text;
  constraint_name text;
begin
  perform pg_catalog.set_config('lock_timeout', '1500ms', true);
  -- Fail atomically if production's original constraint or routines differ.
  select c.conname into strict constraint_name
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.mlb_pregame_research'::regclass
    and c.contype = 'c' and strpos(pg_catalog.pg_get_constraintdef(c.oid), old_pattern) > 0;

  foreach routine in array array[
    'public.read_mlb_pregame_research(text,text,timestamp with time zone)'::regprocedure,
    'public.capture_mlb_pregame_research(text,text,timestamp with time zone,timestamp with time zone,jsonb)'::regprocedure
  ] loop
    definition := pg_catalog.pg_get_functiondef(routine);
    if strpos(definition, old_pattern) = 0 then
      raise exception 'The MLB research archive routine % has changed', routine;
    end if;
    definition := replace(definition, old_pattern, new_pattern);
    if routine = 'public.capture_mlb_pregame_research(text,text,timestamp with time zone,timestamp with time zone,jsonb)'::regprocedure then
      if (length(definition) - length(replace(definition, old_rows_guard, ''))) / length(old_rows_guard) <> 2 then
        raise exception 'The MLB research archive row guards have changed';
      end if;
      definition := replace(definition, old_rows_guard, new_rows_guard);
    end if;
    execute definition;
  end loop;

  execute format('alter table public.mlb_pregame_research drop constraint %I', constraint_name);
  execute format('alter table public.mlb_pregame_research add constraint %I check (resource ~ %L)', constraint_name, new_pattern);
end
$migration$;
