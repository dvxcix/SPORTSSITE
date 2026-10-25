-- PREPARED ONLY. Review the companion read-only preflight before applying.
-- Requires the research schema and root's original board recovery first.
-- Source is public.nba_source_cache (there is no public.nba_cache table).
-- Preserves original source timestamps and caches. No provider fetch or recalculation.
-- Inserts only absent resources; never overwrites existing captures/recovery.
begin;
set local lock_timeout='5s';
set local statement_timeout='25s';
set local jit=off;
with cutoffs as materialized (
  select game_id,min(tipoff_at) tipoff_at from (
    select game_id,tipoff_at from public.nba_odds_phase_games
    union all
    select game_id,tipoff_at from public.nba_pregame_research
    where resource='board:v1' and version=1 and observed_at<tipoff_at
  ) clocks where isfinite(tipoff_at) group by game_id
),
source_keys as materialized (
  select key source_key,fetched_at observed_at,
    regexp_match(key,'^slate:v10:pregame:(2026-10-(?:20|21|22|23|24)):([a-z0-9_]+):([a-z0-9_]+):(over|under):(auto|milestone|over_under):(auto|[0-9]+(?:\.[0-9]+)?):(.+)$') m
  from public.nba_source_cache where key like 'slate:v10:pregame:2026-10-24:threes:all:over:milestone:auto:%' and fetched_at is not null
), phases as materialized (
  select s.source_key,s.observed_at,s.m,
    (regexp_match(token,'^([0-9]+):(.+):(p|l|c)$'))[1]::bigint game_id,
    (regexp_match(token,'^([0-9]+):(.+):(p|l|c)$'))[3] phase
  from source_keys s cross join lateral unnest(string_to_array(s.m[7],'|')) token where s.m is not null
), universes as materialized (
  select source_key,min(observed_at) observed_at,min(m[1]) game_date,min(m[2]) market,min(m[3]) book,min(m[4]) side,min(m[5]) contract,min(m[6]) target,
    array_agg(game_id order by game_id) game_ids,count(*) phase_games,count(distinct game_id) unique_games,
    bool_and(game_id is not null) phases_valid
  from phases group by source_key
), eligible_sources as materialized (
  select distinct p.source_key from phases p join cutoffs k using(game_id)
  where p.phase='p' and p.observed_at<k.tipoff_at and k.tipoff_at<=clock_timestamp()
), possible as materialized (
  -- Discard caches without any still-pregame closed anchor before decompressing
  -- their possibly large JSON payloads.
  select u.* from universes u join eligible_sources e using(source_key)
  where phases_valid and phase_games=unique_games and phase_games between 1 and 16
), parsed_sources as materialized (
  select u.*,doc.date source_date,doc.games source_games,doc.loaded source_loaded,doc.complete source_complete,doc.failed,doc.rows
  from possible u join public.nba_source_cache c on c.key=u.source_key and c.fetched_at=u.observed_at
  cross join lateral jsonb_to_record(c.payload) doc(date text,games integer,loaded integer,complete boolean,failed jsonb,rows jsonb)
), bundles as materialized (
  select * from parsed_sources where source_complete and source_games=phase_games and source_loaded=phase_games
    and source_date=game_date and failed='[]'::jsonb and jsonb_typeof(rows)='array'
), full_rows as materialized (
  select b.source_key,b.observed_at,b.game_date,b.market,b.book,b.side,b.contract,b.target,b.game_ids,row-'signalOffers' row,
    case when row#>>'{game,id}' ~ '^[0-9]+$' then (row#>>'{game,id}')::bigint end game_id,
    case when row#>>'{player,id}' ~ '^[0-9]+$' then (row#>>'{player,id}')::bigint end player_id
  from bundles b cross join lateral jsonb_array_elements(b.rows) row
), checked_rows as materialized (
  select r.*,k.tipoff_at,
    coalesce(r.game_id=any(r.game_ids) and r.player_id>0 and row#>>'{game,date}'=r.game_date and row->>'market'=r.market
      and row#>>'{offer,game_id}'=r.game_id::text and row#>>'{offer,player_id}'=r.player_id::text and row#>>'{offer,prop_type}'=r.market
      and (r.book='all' or row#>>'{offer,vendor}'=r.book)
      and (r.contract='auto' or row#>>'{offer,market,type}'=r.contract or (r.contract='milestone' and r.market in ('double_double','triple_double') and row#>>'{offer,market,type}'='over_under' and (row#>>'{offer,line_value}')::numeric=0.5))
      and (r.target='auto' or (row#>>'{offer,line_value}')::numeric=r.target::numeric)
      and row#>>'{offer,updated_at}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      and (row#>>'{offer,updated_at}')::timestamptz<k.tipoff_at and (row#>>'{offer,updated_at}')::timestamptz<=r.observed_at
      and k.tipoff_at is not null,false) row_valid
  from full_rows r left join cutoffs k using(game_id)
), valid_bundles as materialized (
  select source_key from checked_rows group by source_key having bool_and(row_valid) and count(*)=count(distinct (game_id,player_id))
), heat as materialized (
  -- Domains come from every row in the ORIGINAL complete filtered slate,
  -- before projection down to the owning matchup. Nulls never become zero.
  select r.source_key,metric,
    case when count(value)>=2 and min(value)<max(value) then jsonb_build_array(min(value),max(value)) else 'null'::jsonb end bounds
  from checked_rows r join valid_bundles v using(source_key)
  cross join lateral (values ('average'),('estimate'),('gap')) metrics(metric)
  cross join lateral (select case when jsonb_typeof(row->metric)='number' and abs((row->>metric)::numeric)<=1.7976931348623157e308 then (row->>metric)::numeric end value) values_checked
  group by r.source_key,metric
), domains as materialized (
  select source_key,jsonb_object_agg(metric,bounds) heat_domains from heat group by source_key
), projected as materialized (
  select r.game_id,'slate-legacy:v1:'||md5(concat_ws('|',r.game_date,r.market,r.book,r.side,r.contract,r.target)) resource,
    r.tipoff_at,r.observed_at,r.source_key,
    jsonb_build_object('date',r.game_date,'market',r.market,'book',r.book,'side',r.side,'type',r.contract,
      'target',case when r.target='auto' then '"auto"'::jsonb else to_jsonb(r.target::numeric) end,
      'complete',true,'gameIds',to_jsonb(r.game_ids),'heatDomains',d.heat_domains,
      'rows',jsonb_agg(row-'signalOffers' order by (row->>'score')::numeric desc nulls last,(row->>'mm')::numeric desc nulls last,r.player_id)) payload
  from checked_rows r join valid_bundles v using(source_key) join domains d using(source_key)
  join phases p on p.source_key=r.source_key and p.game_id=r.game_id
  where p.phase='p' and r.observed_at<r.tipoff_at and r.tipoff_at<=clock_timestamp()
  group by r.game_id,r.tipoff_at,r.observed_at,r.source_key,r.game_date,r.market,r.book,r.side,r.contract,r.target,r.game_ids,d.heat_domains
), candidates as materialized (
  select distinct on(game_id,resource) * from projected where octet_length(payload::text)<=8388608
  order by game_id,resource,observed_at desc,source_key
),
inserted as (
  insert into public.nba_pregame_research(game_id,resource,version,tipoff_at,observed_at,source,source_key,payload)
  select game_id,resource,1,tipoff_at,observed_at,'recovered-cache',source_key,payload from candidates
  on conflict(game_id,resource,version) do nothing
  returning game_id,resource,observed_at,source_key
)
select jsonb_build_object('inserted',(select count(*) from inserted),'games',(select count(distinct game_id) from inserted),'resources',(select jsonb_agg(x) from (select game_id,count(*) count,min(observed_at) earliest,max(observed_at) latest from inserted group by game_id order by game_id) x));
commit;
