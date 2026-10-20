-- NBA-only capture parity. Apply individually; never replay the migration tree.
-- The first-event feed has its own tape so one upstream outage cannot erase
-- another feed's prices or falsely verify its freshness receipt.
set local lock_timeout = '5s';
do $$ begin
  if to_regclass('public.nba_market_captures') is null or to_regclass('public.nba_quote_openings') is null
    or to_regprocedure('public.nba_keep_player_openings()') is null
    or to_regprocedure('public.nba_game_opening_quotes(bigint,jsonb)') is null then
    raise exception 'NBA capture/opening prerequisites missing';
  end if;
end $$;

create table public.nba_first_basket_captures (
  id bigint generated always as identity primary key,
  game_id bigint not null check (game_id > 0),
  game_date date not null,
  captured_at timestamptz not null default now(),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  props jsonb not null check (jsonb_typeof(props) = 'array')
);
create index nba_first_basket_captures_game_time on public.nba_first_basket_captures(game_id,captured_at desc,id desc);
alter table public.nba_first_basket_captures enable row level security;
revoke all on public.nba_first_basket_captures from public,anon,authenticated,service_role;
grant select,insert on public.nba_first_basket_captures to service_role;
grant usage,select on sequence public.nba_first_basket_captures_id_seq to service_role;

create or replace function public.nba_player_opening_quotes(p_game_id bigint,p_props jsonb)
returns table(player_id bigint,vendor text,market text,market_type text,line numeric,side text,odds integer)
language sql immutable security invoker set search_path='' as $$
  with raw as (
    select q, s.side, s.price
    from jsonb_array_elements(case when jsonb_typeof(p_props)='array' then p_props else '[]'::jsonb end) q
    cross join lateral (values
      ('over', case when q->'market'->>'type'='milestone' then q->'market'->>'odds' else q->'market'->>'over_odds' end),
      ('under', case when q->'market'->>'type'='over_under' then q->'market'->>'under_odds' end)
    ) s(side,price)
    where q->>'game_id'=p_game_id::text
  ), parsed as (
    select case when q->>'player_id' ~ '^[1-9][0-9]{0,12}$' then (q->>'player_id')::bigint end player_id,
      q->>'vendor' vendor,q->>'prop_type' market,q->'market'->>'type' market_type,
      case when q->>'line_value' ~ '^[0-9]{1,4}([.][0-9]{1,6})?$' then (q->>'line_value')::numeric end line,
      side,case when price ~ '^[+-]?[0-9]{3,7}$' then price::integer end odds
    from raw
  ) select distinct p.player_id,p.vendor,p.market,p.market_type,p.line,p.side,p.odds
    from parsed p where p.player_id is not null and length(p.vendor) between 1 and 64
    and p.market ~ '^[a-z][a-z0-9_]{0,63}$'
    and p.market_type in ('over_under','milestone') and p.line between 0 and 1000 and abs(p.odds::bigint) between 100 and 1000000;
$$;

create trigger nba_first_basket_capture_openings after insert on public.nba_first_basket_captures
for each row execute function public.nba_keep_player_openings();

create function public.record_nba_first_basket_capture(p_game_id bigint,p_game_date date,p_fingerprint text,p_props jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare prior text;
begin
  if p_game_id is null or p_game_id<=0 or p_game_date is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_props is null or jsonb_typeof(p_props)<>'array' or jsonb_array_length(p_props)>20000 then raise exception 'Invalid NBA first-basket snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_props) q where
    q->>'game_id' is distinct from p_game_id::text
    or q->>'prop_type' is null or q->>'prop_type' not in ('first_score','first_field_goal','team_first_score','team_first_field_goal','first_score_2pt','first_score_3pt','first_score_free_throw','first_score_dunk','first_score_layup','first_score_other')
    or q->'market'->>'type' is distinct from 'over_under'
    or q->>'line_value' is distinct from '0.5') then raise exception 'NBA first-basket identity mismatch'; end if;
  if jsonb_array_length(p_props)>0 and not exists(select 1 from public.nba_player_opening_quotes(p_game_id,p_props)) then raise exception 'No valid NBA first-basket quotes'; end if;
  perform pg_advisory_xact_lock(p_game_id);
  select fingerprint into prior from public.nba_first_basket_captures where game_id=p_game_id order by captured_at desc,id desc limit 1;
  if prior=p_fingerprint or (prior is null and jsonb_array_length(p_props)=0) then return false; end if;
  insert into public.nba_first_basket_captures(game_id,game_date,fingerprint,props) values(p_game_id,p_game_date,p_fingerprint,p_props);
  return true;
end $$;

-- An empty successful response is a real withdrawal, not permission to keep
-- displaying a now-absent quote. Initial unposted games need no empty archive.
create or replace function public.record_nba_market_capture(p_game_id bigint,p_game_date date,p_fingerprint text,p_props jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare prior text;
begin
  if p_game_id is null or p_game_id<=0 or p_game_date is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_props is null or jsonb_typeof(p_props)<>'array' or jsonb_array_length(p_props)>20000 then raise exception 'Invalid NBA snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_props) q where q->>'game_id' is distinct from p_game_id::text) then raise exception 'NBA snapshot identity mismatch'; end if;
  if jsonb_array_length(p_props)>0 and not exists(select 1 from public.nba_player_opening_quotes(p_game_id,p_props)) then raise exception 'No valid NBA player quotes'; end if;
  perform pg_advisory_xact_lock(p_game_id);
  select fingerprint into prior from public.nba_market_captures where game_id=p_game_id order by captured_at desc,id desc limit 1;
  if prior=p_fingerprint or (prior is null and jsonb_array_length(p_props)=0) then return false; end if;
  insert into public.nba_market_captures(game_id,game_date,fingerprint,props) values(p_game_id,p_game_date,p_fingerprint,p_props);
  return true;
end $$;

create or replace function public.record_nba_game_market_capture(p_game_id bigint,p_game_date date,p_fingerprint text,p_odds jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare prior text; stamp timestamptz:=now();
begin
  if p_game_id is null or p_game_id<=0 or p_game_date is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_odds is null or jsonb_typeof(p_odds)<>'array' or jsonb_array_length(p_odds)>1000 then raise exception 'Invalid NBA game snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_odds) q where q->>'game_id' is not null and q->>'game_id'<>p_game_id::text) then raise exception 'NBA game snapshot identity mismatch'; end if;
  if jsonb_array_length(p_odds)>0 and not exists(select 1 from public.nba_game_opening_quotes(p_game_id,p_odds)) then raise exception 'No valid NBA game quotes'; end if;
  perform pg_advisory_xact_lock(p_game_id);
  select fingerprint into prior from public.nba_game_market_captures where game_id=p_game_id order by captured_at desc,id desc limit 1;
  if prior=p_fingerprint or (prior is null and jsonb_array_length(p_odds)=0) then return false; end if;
  insert into public.nba_game_market_captures(game_id,game_date,captured_at,fingerprint,odds) values(p_game_id,p_game_date,stamp,p_fingerprint,p_odds);
  insert into public.nba_quote_openings(game_id,player_id,vendor,market,market_type,line,side,odds,observed_at)
  select p_game_id,0,q.vendor,q.market,'game',q.line,'over',q.odds,stamp
  from public.nba_game_opening_quotes(p_game_id,p_odds) q order by q.vendor,q.market,q.line,q.odds on conflict do nothing;
  return true;
end $$;

create function public.read_nba_first_basket_captures(p_game_id bigint,p_market text,p_player bigint default null)
returns table(captured_at timestamptz,props jsonb) language sql stable security invoker set search_path='' as $$
  with selected as (
    (select id,captured_at,props from public.nba_first_basket_captures where game_id=p_game_id order by captured_at,id limit 1)
    union
    (select id,captured_at,props from public.nba_first_basket_captures where game_id=p_game_id order by captured_at desc,id desc limit 95)
  ) select s.captured_at,coalesce((select jsonb_agg(q) from jsonb_array_elements(s.props) q where q->>'prop_type'=p_market and (p_player is null or (q->>'player_id')::bigint=p_player)),'[]'::jsonb) from selected s order by s.captured_at,s.id;
$$;
create function public.read_nba_first_basket_state(p_game_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'captures',(select count(*) from public.nba_first_basket_captures where game_id=p_game_id),
    'frames',coalesce((select jsonb_agg(jsonb_build_object('captured_at',s.captured_at,'props',s.props) order by s.captured_at,s.id)
      from (select id,captured_at,props from public.nba_first_basket_captures where game_id=p_game_id order by captured_at desc,id desc limit 2) s),'[]'::jsonb));
$$;

-- Repair only the three first-three-minute opening omissions from real stored
-- observations. Preserve all existing opening rows; do not re-fetch any jobs.
lock table public.nba_market_captures in share row exclusive mode;
insert into public.nba_quote_openings(game_id,player_id,vendor,market,market_type,line,side,odds,observed_at)
select distinct on (c.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side)
  c.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds,c.captured_at
from public.nba_market_captures c
cross join lateral public.nba_player_opening_quotes(c.game_id,c.props) q
where q.market in ('points_first3min','rebounds_first3min','assists_first3min')
order by c.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,c.captured_at,c.id,q.odds
on conflict do nothing;

revoke all on function public.record_nba_first_basket_capture(bigint,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.read_nba_first_basket_captures(bigint,text,bigint) from public,anon,authenticated;
revoke all on function public.read_nba_first_basket_state(bigint) from public,anon,authenticated;
revoke all on function public.record_nba_market_capture(bigint,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.record_nba_game_market_capture(bigint,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.nba_player_opening_quotes(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.record_nba_first_basket_capture(bigint,date,text,jsonb) to service_role;
grant execute on function public.read_nba_first_basket_captures(bigint,text,bigint) to service_role;
grant execute on function public.read_nba_first_basket_state(bigint) to service_role;
grant execute on function public.record_nba_market_capture(bigint,date,text,jsonb) to service_role;
grant execute on function public.record_nba_game_market_capture(bigint,date,text,jsonb) to service_role;
grant execute on function public.nba_player_opening_quotes(bigint,jsonb) to service_role;
