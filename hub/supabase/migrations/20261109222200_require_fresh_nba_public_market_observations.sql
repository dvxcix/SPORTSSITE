-- Continuity snapshots may carry older counts forward. Budget deduplication
-- requires each of the four core markets to have been observed in the window.
set local lock_timeout='2s';
set local statement_timeout='10s';

do $migration$
declare
  target regprocedure := to_regprocedure('public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid,bigint[])');
  source text := pg_get_functiondef(target);
  old text := $old$and c.snapshot->'rows' @> '[{"market":"points"},{"market":"rebounds"},{"market":"assists"},{"market":"threes"}]'::jsonb$old$;
  replacement text := $new$and 4=(
                select count(distinct m->>'value')
                from jsonb_array_elements(case when jsonb_typeof(c.snapshot->'marketStates')='array'
                  then c.snapshot->'marketStates' else '[]'::jsonb end) m
                where m->>'value' in ('points','rebounds','assists','threes')
                  and m->>'status'='captured' and (m->>'rows')::integer>0
                  and (m->>'observedAt')::timestamptz>=schedule.tip-interval '2 hours'
                  and (m->>'observedAt')::timestamptz<=now_at
              )$new$;
begin
  if md5(source) is distinct from 'b72bafe0837d31f5a54d5f36e4b3a3d3'
    or (length(source)-length(replace(source,old,'')))/length(old)<>1
  then raise exception 'NBA public browser guard changed; review before release'; end if;
  execute replace(source,old,replacement);
end $migration$;
