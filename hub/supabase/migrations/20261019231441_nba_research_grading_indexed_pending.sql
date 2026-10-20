-- Replace only the reviewed grader. Preserve its privileges, result semantics,
-- and SECURITY INVOKER boundary; do not replay any data or other migrations.
set local lock_timeout = '5s';
do $$
begin
  if to_regprocedure('public.grade_nba_research_snapshots(integer)') is null
    or md5(pg_get_functiondef('public.grade_nba_research_snapshots(integer)'::regprocedure))
      is distinct from 'a4f3cd3fcc2bf662eea5af22de1aacbc' then
    raise exception 'NBA research grader changed; review the live definition before applying';
  end if;
end $$;

create or replace function public.grade_nba_research_snapshots(p_limit integer default 2000)
returns integer language plpgsql security invoker set search_path=public as $$
declare updated integer;
begin
  if p_limit<1 or p_limit>10000 then raise exception 'Invalid NBA grade batch'; end if;
  -- Pending captures can repeat the same player/market thousands of times. Resolve
  -- each fact and market once; never scan season-wide JSON before these keys.
  with pending as materialized (
    select r.id,r.game_id,r.player_id,r.market,g.season,
      case when right(r.market,3)='_1q' then 1 else 0 end as period
    from public.nba_research_snapshots r
    join public.nba_games g on g.id=r.game_id
    where r.status='pending'
  ), pending_keys as materialized (
    select distinct game_id,player_id,season,period from pending
  ), facts as materialized (
    select k.game_id,k.player_id,k.season,k.period,s.payload
    from pending_keys k
    cross join lateral (
      select s.payload from public.nba_player_game_stats s
      where k.period=0 and s.game_id=k.game_id and s.player_id=k.player_id
        and s.season=k.season and not s.postseason
      union all
      select s.payload from public.nba_player_period_stats s
      where k.period=1 and s.period=1 and s.game_id=k.game_id and s.player_id=k.player_id
        and s.season=k.season and not s.postseason
      -- Keep this correlated lookup behind a planner boundary. Without it,
      -- UNION ALL can become full-history scans ahead of the pending-key join.
      offset 0
    ) s
    where (s.payload->'game'->>'status_state'='final' or s.payload->'game'->>'status'='Final')
      and public.nba_stat_appeared(s.payload)
  ), outcomes as materialized (
    select m.game_id,m.player_id,m.market,
      public.nba_stat_market_value(f.payload,m.market) as actual
    from (select distinct game_id,player_id,season,period,market from pending) m
    join facts f on f.game_id=m.game_id and f.player_id=m.player_id
      and f.season=m.season and f.period=m.period
  ), eligible as materialized (
    select p.id,o.actual from pending p
    join outcomes o on o.game_id=p.game_id and o.player_id=p.player_id and o.market=p.market
    where o.actual is not null
    -- Limit eligible outcomes, so older future or incomplete games cannot
    -- monopolize the batch and starve genuinely final observations.
    order by p.id limit p_limit
  ) update public.nba_research_snapshots r set status='final',actual_value=e.actual,
    absolute_error=case when r.estimate is null then null else abs(r.estimate-e.actual) end,graded_at=now()
    from eligible e where e.id=r.id and r.status='pending';
  get diagnostics updated=row_count;return updated;
end $$;
