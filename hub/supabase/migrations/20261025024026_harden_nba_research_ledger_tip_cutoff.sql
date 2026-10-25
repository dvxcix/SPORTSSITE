-- Preserve prospective research ledger semantics while making its cutoff agree
-- with the durable pregame archive. No historical scores or outcomes are changed.
create or replace function public.record_nba_research_batch(p_rows jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb; g public.nba_games%rowtype; starts timestamptz; previous text; inserted integer:=0; game_key bigint;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1500 then raise exception 'Invalid NBA research batch'; end if;
  -- Match the archive writer's game lock. Sorted acquisition also preserves a
  -- consistent order for callers that submit more than one game in a batch.
  for game_key in select distinct (value->>'game_id')::bigint from jsonb_array_elements(p_rows) order by 1 loop
    perform pg_advisory_xact_lock(81051,(game_key % 2147483647)::integer);
  end loop;
  for item in select value from jsonb_array_elements(p_rows) loop
    select * into g from public.nba_games where id=(item->>'game_id')::bigint;
    if not found or g.postseason then raise exception 'NBA research game missing'; end if;
    starts:=public.nba_phase_cutoff(g.id,(g.payload->>'datetime')::timestamptz);
    if starts is null or not isfinite(starts) or starts<=clock_timestamp() or g.payload->>'status_state' in ('final','in_progress') or g.payload->>'status'='Final' or coalesce((g.payload->>'period')::integer,0)>0 then raise exception 'NBA research must be captured before tipoff'; end if;
    if (item->>'team_id')::bigint not in(g.home_team_id,g.visitor_team_id) or not exists(select 1 from public.nba_players where id=(item->>'player_id')::bigint) then raise exception 'NBA research identity invalid'; end if;
    if (item->>'sample_through')::date>=g.game_date or (item->>'sample_through')::date>current_date or jsonb_typeof(item->'features') is distinct from 'object' or octet_length((item->'features')::text)>65536 or item->>'fingerprint' !~ '^[a-f0-9]{64}$' or length(item->>'version')>80 then raise exception 'NBA research sample invalid'; end if;
    if item->>'estimate' is not null and not exists(select 1 from public.nba_model_reports where model_key=item->>'model_key' and (report->>'trainedThrough')::date<g.game_date and (report->>'validationThrough')::date<g.game_date) then raise exception 'NBA research model chronology invalid'; end if;
    if item->'quote' is not null and item->'quote'<>'null'::jsonb and (item->'quote'->>'game_id' is distinct from item->>'game_id' or item->'quote'->>'player_id' is distinct from item->>'player_id' or item->'quote'->>'prop_type' is distinct from item->>'market') then raise exception 'NBA research quote identity invalid'; end if;
    perform pg_advisory_xact_lock(hashtextextended('nba-research:'||(item->>'game_id')||':'||(item->>'player_id')||':'||(item->>'market')||':'||(item->>'version'),0));
    -- A queued transaction must recheck the actual clock and latest game state
    -- after every lock wait; transaction-start now() can remain before tip.
    select * into g from public.nba_games where id=(item->>'game_id')::bigint;
    starts:=public.nba_phase_cutoff(g.id,(g.payload->>'datetime')::timestamptz);
    if starts is null or not isfinite(starts) or starts<=clock_timestamp() or g.payload->>'status_state' in ('final','in_progress') or g.payload->>'status'='Final' or coalesce((g.payload->>'period')::integer,0)>0 then raise exception 'NBA research must be captured before tipoff'; end if;
    select fingerprint into previous from public.nba_research_snapshots where game_id=(item->>'game_id')::bigint and player_id=(item->>'player_id')::bigint and market=item->>'market' and version=item->>'version' order by captured_at desc,id desc limit 1;
    if previous is not distinct from item->>'fingerprint' then continue; end if;
    -- Explicit wall-clock time avoids the table's legacy transaction-start
    -- default. Its captured_at < game_starts_at constraint is the final guard.
    insert into public.nba_research_snapshots(game_id,player_id,team_id,market,version,score,sample_games,sample_through,game_starts_at,captured_at,fingerprint,features,quote,estimate,model_key)
    values((item->>'game_id')::bigint,(item->>'player_id')::bigint,(item->>'team_id')::bigint,item->>'market',item->>'version',(item->>'score')::integer,(item->>'sample_games')::integer,(item->>'sample_through')::date,starts,clock_timestamp(),item->>'fingerprint',item->'features',nullif(item->'quote','null'::jsonb),(item->>'estimate')::numeric,item->>'model_key');
    inserted:=inserted+1;
  end loop;
  return inserted;
end $$;
revoke all on function public.record_nba_research_batch(jsonb) from public,anon,authenticated;
grant execute on function public.record_nba_research_batch(jsonb) to service_role;
