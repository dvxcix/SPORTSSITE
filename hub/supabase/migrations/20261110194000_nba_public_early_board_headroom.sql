-- Give the existing scheduled NBA public collector one earlier, protected
-- admission per Eastern day when a game has no fresh core market counts.
-- Preserve the four-admission daily cap, the period cap, and final refreshes.
set local lock_timeout='2s';
set local statement_timeout='10s';

do $migration$
declare
  target regprocedure := to_regprocedure('public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid,bigint[])');
  source text := pg_get_functiondef(target);
  old text := $old$        where g.id=any(p_public_games)
          and coalesce(g.payload->>'status_state','unknown') in ('scheduled','unknown')
          and schedule.tip>now_at and schedule.tip<=now_at+interval '2 hours'
          and not exists (
            select 1 from public.nba_public_captures c
            where c.game_id=g.id and c.captured_at>=schedule.tip-interval '2 hours'
              and c.captured_at<=now_at
              and 4=(
                select count(distinct m->>'value')
                from jsonb_array_elements(case when jsonb_typeof(c.snapshot->'marketStates')='array'
                  then c.snapshot->'marketStates' else '[]'::jsonb end) m
                where m->>'value' in ('points','rebounds','assists','threes')
                  and m->>'status'='captured' and (m->>'rows')::integer>0
                  and (m->>'observedAt')::timestamptz>=schedule.tip-interval '2 hours'
                  and (m->>'observedAt')::timestamptz<=now_at
              )
          )$old$;
  replacement text := $new$        -- Spend the first available NBA headroom admission at T-4h when
        -- a complete core board is missing. Later admissions keep the
        -- existing T-2h protection and share the same daily and period limits.
        cross join lateral (select case when not exists (
          select 1 from public.browserbase_shared_budget_reservations prior
          where prior.project_id=p_project and prior.period_id=p_period and prior.nba_public_headroom
            and prior.created_at>=greatest(s.starts_at,date_trunc('day',now_at,'America/New_York'))
        ) then interval '4 hours' else interval '2 hours' end as span) capture_window
        where g.id=any(p_public_games)
          and coalesce(g.payload->>'status_state','unknown') in ('scheduled','unknown')
          and schedule.tip>now_at and schedule.tip<=now_at+capture_window.span
          and not exists (
            select 1 from public.nba_public_captures c
            where c.game_id=g.id and c.captured_at>=(case when schedule.tip<=now_at+interval '2 hours'
                then schedule.tip-interval '2 hours' else now_at-interval '1 hour' end)
              and c.captured_at<=now_at
              and 4=(
                select count(distinct m->>'value')
                from jsonb_array_elements(case when jsonb_typeof(c.snapshot->'marketStates')='array'
                  then c.snapshot->'marketStates' else '[]'::jsonb end) m
                where m->>'value' in ('points','rebounds','assists','threes')
                  and m->>'status'='captured' and (m->>'rows')::integer>0
                  and (m->>'observedAt')::timestamptz>=(case when schedule.tip<=now_at+interval '2 hours'
                then schedule.tip-interval '2 hours' else now_at-interval '1 hour' end)
                  and (m->>'observedAt')::timestamptz<=now_at
              )
          )$new$;
begin
  if md5(source) is distinct from 'cb4375ed6ead4190624d704d83e7151e'
    or (length(source)-length(replace(source,old,'')))/length(old)<>1
  then raise exception 'NBA public browser guard changed; review before release'; end if;
  execute replace(source,old,replacement);
end $migration$;
