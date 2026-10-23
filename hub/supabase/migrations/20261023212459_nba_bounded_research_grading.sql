-- Incident-only work bound. No archival replay or stored outcome rewrite.
set local lock_timeout='2s';
set local statement_timeout='45s';
do $$ begin
 if to_regprocedure('public.grade_nba_research_snapshots(integer)') is null
 or md5(pg_get_functiondef('public.grade_nba_research_snapshots(integer)'::regprocedure)) is distinct from 'ac584c113fe3cf83a233d69f22dc5c32'
 or to_regclass('public.nba_research_grade_state') is not null
 or to_regclass('public.nba_research_snapshot_pending_cursor') is not null then
   raise exception 'NBA grader prerequisites changed; review before applying';
 end if;
end $$;

-- The key range ends before future games; no JSON or full pending ledger scan.
create index nba_research_snapshot_pending_cursor on public.nba_research_snapshots(game_starts_at,id) where status='pending';
create table public.nba_research_grade_state (
 singleton boolean primary key default true check(singleton),
 last_game_starts_at timestamptz not null default '-infinity',
 last_id bigint not null default 0,
 last_scanned integer not null default 0 check(last_scanned between 0 and 10000),
 last_graded integer not null default 0 check(last_graded between 0 and 10000),
 updated_at timestamptz not null default now()
);
alter table public.nba_research_grade_state enable row level security;
revoke all on public.nba_research_grade_state from public,anon,authenticated,service_role;
grant select,insert,update on public.nba_research_grade_state to service_role;

create or replace function public.grade_nba_research_snapshots(p_limit integer default 2000)
returns integer language plpgsql security invoker set search_path=public as $$
declare updated integer; cursor_at timestamptz; cursor_id bigint; candidate_ids bigint[]; next_at timestamptz;
begin
 if p_limit is null or p_limit<1 or p_limit>10000 then raise exception 'Invalid NBA grade batch'; end if;
 -- A concurrent invocation returns without inspecting or advancing another batch.
 if not pg_try_advisory_xact_lock(-681521903227::bigint) then return 0; end if;
 insert into public.nba_research_grade_state(singleton) values(true) on conflict do nothing;
 select last_game_starts_at,last_id into cursor_at,cursor_id from public.nba_research_grade_state where singleton for update;
 select array_agg(c.id order by c.game_starts_at,c.id),max(c.game_starts_at) into candidate_ids,next_at from (
   select id,game_starts_at from public.nba_research_snapshots
   where status='pending' and game_starts_at<now() and (game_starts_at,id)>(cursor_at,cursor_id)
   order by game_starts_at,id limit p_limit
 )c;
 if candidate_ids is null then
   -- Wrap only after the forward range ends. Missing/nonfinal/DNP facts cannot
   -- monopolize the oldest batch, and are revisited in a later bounded cycle.
   select array_agg(c.id order by c.game_starts_at,c.id),max(c.game_starts_at) into candidate_ids,next_at from (
     select id,game_starts_at from public.nba_research_snapshots
     where status='pending' and game_starts_at<now()
     order by game_starts_at,id limit p_limit
   )c;
 end if;
 if candidate_ids is null then
   update public.nba_research_grade_state set last_game_starts_at='-infinity',last_id=0,last_scanned=0,last_graded=0,updated_at=now() where singleton;
   return 0;
 end if;
 with pending as materialized (
   select r.id,r.game_id,r.player_id,r.market,g.season,
     case when right(r.market,3)='_1q' then 1 else 0 end as period
   from unnest(candidate_ids) chosen(id)
   cross join lateral (
     select r.id,r.game_id,r.player_id,r.market from public.nba_research_snapshots r
     where r.id=chosen.id and r.status='pending' offset 0
   )r join public.nba_games g on g.id=r.game_id
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
    -- Candidate inspection is already bounded; retain the output cap too.
    order by p.id limit p_limit
  ) update public.nba_research_snapshots r set status='final',actual_value=e.actual,
    absolute_error=case when r.estimate is null then null else abs(r.estimate-e.actual) end,graded_at=now()
    from eligible e where e.id=r.id and r.status='pending';

 get diagnostics updated=row_count;
 update public.nba_research_grade_state set last_game_starts_at=next_at,last_id=candidate_ids[cardinality(candidate_ids)],
   last_scanned=cardinality(candidate_ids),last_graded=updated,updated_at=now() where singleton;
 return updated;
end $$;
revoke all on function public.grade_nba_research_snapshots(integer) from public,anon,authenticated;
grant execute on function public.grade_nba_research_snapshots(integer) to service_role;
