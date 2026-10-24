set lock_timeout = '3s';
do $$ begin
  if md5(pg_get_functiondef('public.record_nba_public_capture(bigint,date,timestamptz,text,jsonb)'::regprocedure)) <> '3e6ffa75ebc4e793a80b4205d1707e4a' then
    raise exception 'NBA public writer changed; inspect before applying';
  end if;
end $$;

-- The latest snapshot becomes a bounded materialized view of actual per-row
-- observations. Raw category reports stay private in the same append-only tape.
-- No historical rows are rewritten and no backfill or capture is triggered.
create or replace function public.record_nba_public_capture(p_game_id bigint,p_game_date date,p_captured_at timestamptz,p_fingerprint text,p_snapshot jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
  stamp timestamptz; cutoff timestamptz; provided timestamptz;
  latest public.nba_public_captures%rowtype;
  seed jsonb; merged jsonb; before_counts jsonb; after_counts jsonb;
  snapshot jsonb; bootstrap_limit integer;
begin
  if p_game_id is null or p_game_id<=0 or p_game_date is null or p_captured_at is null or not isfinite(p_captured_at)
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_snapshot->'rows') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'rows')>10000 or octet_length(p_snapshot::text)>2000000
    or p_snapshot->>'gameId' is distinct from p_game_id::text then raise exception 'Invalid NBA public capture'; end if;
  if jsonb_array_length(p_snapshot->'rows')=0 and
    (p_snapshot->>'continuityVersion' is distinct from '1' or jsonb_typeof(p_snapshot->'marketStates') is distinct from 'array'
      or jsonb_array_length(p_snapshot->'marketStates') not between 1 and 100) then raise exception 'Empty NBA observation lacks category evidence'; end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'rows') r where
    jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'playerId') is distinct from 'number' or (r->>'playerId') !~ '^[1-9][0-9]{0,12}$'
    or jsonb_typeof(r->'market') is distinct from 'string' or (r->>'market') !~ '^[a-z][a-z0-9_]{0,79}$'
    or jsonb_typeof(r->'picks') is distinct from 'number' or (r->>'picks') !~ '^[0-9]{1,8}$' or (r->>'picks')::numeric>10000000)
    or (select count(*) from jsonb_array_elements(p_snapshot->'rows'))<>(select count(distinct (r->>'playerId',r->>'market')) from jsonb_array_elements(p_snapshot->'rows') r)
    then raise exception 'Invalid or duplicate NBA public row'; end if;

  -- Coordinate with the canonical phase-clock writer as well as other public
  -- writers. Recheck wall time only after both locks have been acquired.
  perform pg_advisory_xact_lock(p_game_id);
  perform pg_advisory_xact_lock(hashtextextended('nba-public:'||p_game_id,0));
  stamp:=clock_timestamp();
  provided:=public.nba_phase_quote_time(p_snapshot->>'tipAt');
  if provided is null then select tipoff_at into provided from public.nba_odds_phase_games where game_id=p_game_id; end if;
  cutoff:=public.nba_phase_cutoff(p_game_id,provided);
  if cutoff is null or stamp>=cutoff or p_captured_at>=cutoff or p_captured_at>stamp+interval '1 minute' or p_captured_at<stamp-interval '1 hour' then
    raise exception 'NBA public capture crossed pregame boundary';
  end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'rows') r where r ? 'capturedAt' and
    (public.nba_phase_quote_time(r->>'capturedAt') is null or public.nba_phase_quote_time(r->>'capturedAt')>p_captured_at
      or public.nba_phase_quote_time(r->>'capturedAt')>=cutoff or public.nba_phase_quote_time(r->>'capturedAt')<stamp-interval '1 hour')) then
    raise exception 'NBA public row observation is invalid';
  end if;
  select * into latest from public.nba_public_captures where game_id=p_game_id order by captured_at desc,id desc limit 1;
  if found and (latest.game_date<>p_game_date or latest.captured_at>=p_captured_at) then raise exception 'NBA public capture identity or observation regressed'; end if;
  bootstrap_limit:=case when latest.snapshot->>'continuityVersion'='1' then 1 else 64 end;

  -- Bound indexed frame identities before loading/expanding JSON. Legacy
  -- sparse snapshots bootstrap once; every subsequent write reads one composite.
  with keys as materialized (
    select id,captured_at from public.nba_public_captures
    where game_id=p_game_id and game_date=p_game_date and captured_at<cutoff and captured_at<p_captured_at
    order by captured_at desc,id desc limit bootstrap_limit
  ), frames as materialized (
    select k.captured_at,c.snapshot from keys k join public.nba_public_captures c on c.id=k.id
  ), observations as (
    select r,coalesce(r->>'normalizationVersion',f.snapshot->>'normalizationVersion') as version,
      case when r ? 'capturedAt' then public.nba_phase_quote_time(r->>'capturedAt') else f.captured_at end as observed_at,f.captured_at as frame_at
    from frames f cross join lateral jsonb_array_elements(f.snapshot->'rows') r
    where jsonb_typeof(r)='object' and (r->>'playerId') ~ '^[1-9][0-9]{0,12}$' and (r->>'market') ~ '^[a-z][a-z0-9_]{0,79}$'
      and (r->>'picks') ~ '^[0-9]{1,8}$' and (r->>'picks')::numeric<=10000000
  ), unique_observations as (
    select distinct on(r->>'playerId',r->>'market',observed_at) r,version,observed_at
    from observations where observed_at is not null and observed_at<=frame_at and observed_at<cutoff
    order by r->>'playerId',r->>'market',observed_at desc,frame_at desc
  ), ranked as (
    select *,row_number() over(partition by r->>'playerId',r->>'market' order by observed_at desc) as n from unique_observations
  ), paired as (
    select c.r,c.version,c.observed_at,
      case when c.r ? 'previous' then c.r->'previous' else p.r->'picks' end as previous,
      case when c.r ? 'previous' then public.nba_phase_quote_time(c.r->>'previousAt') else p.observed_at end as previous_at
    from ranked c left join ranked p on p.n=2 and p.r->>'playerId'=c.r->>'playerId' and p.r->>'market'=c.r->>'market' where c.n=1
  ) select coalesce(jsonb_agg(jsonb_build_object('playerId',(r->>'playerId')::bigint,'market',r->>'market','picks',(r->>'picks')::integer,
      'capturedAt',observed_at,'normalizationVersion',version,
      'previous',case when previous_at<observed_at and previous_at<cutoff and jsonb_typeof(previous)='number' then previous else 'null'::jsonb end,
      'previousAt',case when previous_at<observed_at and previous_at<cutoff and jsonb_typeof(previous)='number' then to_jsonb(previous_at) else 'null'::jsonb end)
    order by (r->>'playerId')::bigint,r->>'market'),'[]'::jsonb) into seed from paired;

  with prior as (select r from jsonb_array_elements(seed) r), incoming as (
    select r,case when r ? 'capturedAt' then public.nba_phase_quote_time(r->>'capturedAt') else p_captured_at end as observed_at
    from jsonb_array_elements(p_snapshot->'rows') r
  ), merged_rows as (
    select case when n.r is null or (p.r is not null and n.observed_at<=public.nba_phase_quote_time(p.r->>'capturedAt')) then p.r
      else jsonb_build_object('playerId',(n.r->>'playerId')::bigint,'market',n.r->>'market','picks',(n.r->>'picks')::integer,
        'capturedAt',n.observed_at,'normalizationVersion',coalesce(n.r->>'normalizationVersion',p_snapshot->>'normalizationVersion'),
        'previous',coalesce(p.r->'picks','null'::jsonb),'previousAt',coalesce(p.r->'capturedAt','null'::jsonb)) end as r
    from prior p full join incoming n on n.r->>'playerId'=p.r->>'playerId' and n.r->>'market'=p.r->>'market'
  ) select coalesce(jsonb_agg(r order by (r->>'playerId')::bigint,r->>'market'),'[]'::jsonb) into merged from merged_rows;
  if jsonb_array_length(merged)>10000 then raise exception 'NBA public composite exceeds row limit'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(r->'playerId',r->'market',r->'picks') order by (r->>'playerId')::bigint,r->>'market'),'[]'::jsonb)
    into before_counts from jsonb_array_elements(seed) r;
  select coalesce(jsonb_agg(jsonb_build_array(r->'playerId',r->'market',r->'picks') order by (r->>'playerId')::bigint,r->>'market'),'[]'::jsonb)
    into after_counts from jsonb_array_elements(merged) r;
  snapshot:=p_snapshot||jsonb_build_object('continuityVersion',1,'rows',merged,'capturedAt',p_captured_at,'tipAt',cutoff,
    'markets',(select coalesce(jsonb_agg(market order by market),'[]'::jsonb) from (select distinct r->>'market' as market from jsonb_array_elements(merged) r) markets));
  insert into public.nba_public_captures(game_id,game_date,captured_at,fingerprint,snapshot)
    values(p_game_id,p_game_date,p_captured_at,p_fingerprint,snapshot);
  return before_counts is distinct from after_counts;
end $$;
revoke all on function public.record_nba_public_capture(bigint,date,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_nba_public_capture(bigint,date,timestamptz,text,jsonb) to service_role;
