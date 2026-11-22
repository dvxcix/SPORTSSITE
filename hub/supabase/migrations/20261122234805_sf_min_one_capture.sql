-- Owner authorized one additional SF/MIN FanDuel capture on 23 November local.
-- Keep every normal quota, checkpoint, cutoff and session release guard.
set lock_timeout='2s';
set statement_timeout='10s';
do $repair$
declare f regprocedure := 'public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid,bigint[])'::regprocedure; definition text;
begin
 definition:=pg_get_functiondef(f);
 if md5(definition)<>'9e2415904aa44a1848eeb694df50ace6' then raise exception 'Budget definition changed; review first'; end if;
 if (length(definition)-length(replace(definition,')>=16 then','')))/length(')>=16 then')<>1 then raise exception 'Expected NFL quota guard missing'; end if;
 definition:=replace(definition,')>=16 then',$scope$)>=16 and not (
      p_timeout_seconds<=450
      and now_at>='2026-11-22T23:45:00Z'::timestamptz
      and now_at<'2026-11-23T01:12:00Z'::timestamptz
      and (select count(*) from public.browserbase_shared_budget_reservations one_extra
        where one_extra.project_id=p_project and one_extra.nfl_fanduel_cutoff is not null
          and one_extra.created_at>=date_trunc('day',now_at,'America/New_York'))<17
      and exists (select 1 from public.nba_source_cache batch
        where batch.key='nfl:browser:v1:fanduel-batch:'||p_id::text
          and batch.expires_at>now_at
          and jsonb_typeof(batch.payload->'games')='array'
          and jsonb_array_length(batch.payload->'games')=1
          and batch.payload->'games'->0->>'gameId'='2026_11_MIN_SF')
    ) then$scope$);
 execute definition;
end
$repair$;

