-- One observation per player/game/market/version: latest genuine pre-tip capture.
create or replace function public.read_nba_research_summary()
returns jsonb language sql stable security invoker set search_path=public as $$
  with latest as (
    select distinct on(game_id,player_id,market,version) * from public.nba_research_snapshots
    where captured_at<game_starts_at order by game_id,player_id,market,version,captured_at desc,id desc
  ), grouped as (
    select market,version,count(*) as observations,count(*) filter(where status='pending') as pending,
      count(*) filter(where status='final') as final,count(*) filter(where status='dnp') as dnp,
      count(*) filter(where status='final' and estimate is not null) as forecasts,
      avg(absolute_error) filter(where status='final' and estimate is not null) as mae,
      max(captured_at) as last_capture,max(graded_at) as last_grade from latest group by market,version
  ) select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) from grouped
$$;
revoke all on function public.read_nba_research_summary() from public,anon,authenticated;
grant execute on function public.read_nba_research_summary() to service_role;
