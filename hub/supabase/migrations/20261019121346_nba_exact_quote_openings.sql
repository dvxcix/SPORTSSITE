-- NBA-only, additive repair. Recover openings from real captures; never invent
-- pre-capture prices. Browser/member roles have no direct table or RPC access.
-- Keep the historical scan and trigger installation atomic with cloud writers.
set local lock_timeout = '5s';
lock table public.nba_market_captures in share row exclusive mode;
create table public.nba_quote_openings (
  game_id bigint not null check (game_id > 0),
  player_id bigint not null check (player_id >= 0),
  vendor text not null check (length(vendor) between 1 and 64),
  market text not null check (length(market) between 1 and 64),
  market_type text not null check (market_type in ('over_under','milestone','game')),
  line numeric not null check (line between -1000 and 1000),
  side text not null check (side in ('over','under')),
  odds integer not null check (abs(odds::bigint) between 100 and 1000000),
  observed_at timestamptz not null,
  primary key (game_id,player_id,vendor,market,market_type,line,side),
  check ((player_id=0 and market_type='game') or (player_id>0 and market_type<>'game'))
);
alter table public.nba_quote_openings enable row level security;
revoke all on public.nba_quote_openings from public,anon,authenticated,service_role;
grant select,insert on public.nba_quote_openings to service_role;

create table public.nba_game_market_captures (
  id bigint generated always as identity primary key,
  game_id bigint not null check (game_id>0),
  game_date date not null,
  captured_at timestamptz not null default now(),
  fingerprint text not null,
  odds jsonb not null check (jsonb_typeof(odds)='array')
);
create index nba_game_market_captures_game_time on public.nba_game_market_captures(game_id,captured_at desc,id desc);
alter table public.nba_game_market_captures enable row level security;
revoke all on public.nba_game_market_captures from public,anon,authenticated,service_role;
grant select,insert on public.nba_game_market_captures to service_role;
grant usage,select on sequence public.nba_game_market_captures_id_seq to service_role;

create function public.nba_player_opening_quotes(p_game_id bigint,p_props jsonb)
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
    and p.market in ('points','rebounds','assists','threes','points_rebounds_assists','points_rebounds','points_assists','rebounds_assists','steals','blocks','turnovers','double_double','triple_double','points_1q','rebounds_1q','assists_1q')
    and p.market_type in ('over_under','milestone') and p.line between 0 and 1000 and abs(p.odds::bigint) between 100 and 1000000;
$$;

create function public.nba_game_opening_quotes(p_game_id bigint,p_odds jsonb)
returns table(vendor text,market text,line numeric,odds integer)
language sql immutable security invoker set search_path='' as $$
  with raw as (
    select q->>'vendor' vendor,v.market,v.line,v.price
    from jsonb_array_elements(case when jsonb_typeof(p_odds)='array' then p_odds else '[]'::jsonb end) q
    cross join lateral (values
      ('spread_home',q->>'spread_home_value',q->>'spread_home_odds'),
      ('spread_away',q->>'spread_away_value',q->>'spread_away_odds'),
      ('moneyline_home','0',q->>'moneyline_home_odds'),
      ('moneyline_away','0',q->>'moneyline_away_odds'),
      ('total_over',q->>'total_value',q->>'total_over_odds'),
      ('total_under',q->>'total_value',q->>'total_under_odds')
    ) v(market,line,price)
    where q->>'game_id' is null or q->>'game_id'=p_game_id::text
  ), parsed as (
    select vendor,market,
      case when line ~ '^[+-]?[0-9]{1,4}([.][0-9]{1,6})?$' then line::numeric end line,
      case when price ~ '^[+-]?[0-9]{3,7}$' then price::integer end odds from raw
  ) select distinct p.vendor,p.market,p.line,p.odds from parsed p
    where length(p.vendor) between 1 and 64 and p.line between -1000 and 1000 and abs(p.odds::bigint) between 100 and 1000000;
$$;

-- Select the first actual observation per contract across ALL retained history,
-- including alt lines that were absent in the game's first captured frame.
insert into public.nba_quote_openings(game_id,player_id,vendor,market,market_type,line,side,odds,observed_at)
select distinct on (c.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side)
  c.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds,c.captured_at
from public.nba_market_captures c
cross join lateral public.nba_player_opening_quotes(c.game_id,c.props) q
order by c.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,c.captured_at,c.id,q.odds
on conflict do nothing;

create function public.nba_keep_player_openings() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.nba_quote_openings(game_id,player_id,vendor,market,market_type,line,side,odds,observed_at)
  select new.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds,new.captured_at
  from public.nba_player_opening_quotes(new.game_id,new.props) q
  order by q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds
  on conflict do nothing;
  return new;
end $$;
create trigger nba_market_capture_openings after insert on public.nba_market_captures
for each row execute function public.nba_keep_player_openings();

create function public.record_nba_game_market_capture(p_game_id bigint,p_game_date date,p_fingerprint text,p_odds jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare prior text; stamp timestamptz:=now();
begin
  if p_game_id is null or p_game_id<=0 or p_game_date is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_odds is null or jsonb_typeof(p_odds)<>'array' or jsonb_array_length(p_odds)=0 or jsonb_array_length(p_odds)>1000 then
    raise exception 'Invalid NBA game snapshot';
  end if;
  if exists(select 1 from jsonb_array_elements(p_odds) q where q->>'game_id' is not null and q->>'game_id'<>p_game_id::text) then
    raise exception 'NBA game snapshot identity mismatch';
  end if;
  if not exists(select 1 from public.nba_game_opening_quotes(p_game_id,p_odds)) then raise exception 'No valid NBA game quotes'; end if;
  perform pg_advisory_xact_lock(p_game_id);
  select fingerprint into prior from public.nba_game_market_captures where game_id=p_game_id order by captured_at desc,id desc limit 1;
  if prior=p_fingerprint then return false; end if;
  insert into public.nba_game_market_captures(game_id,game_date,captured_at,fingerprint,odds) values(p_game_id,p_game_date,stamp,p_fingerprint,p_odds);
  insert into public.nba_quote_openings(game_id,player_id,vendor,market,market_type,line,side,odds,observed_at)
  select p_game_id,0,q.vendor,q.market,'game',q.line,'over',q.odds,stamp
  from public.nba_game_opening_quotes(p_game_id,p_odds) q order by q.vendor,q.market,q.line,q.odds on conflict do nothing;
  return true;
end $$;

-- JSON aggregation prevents the REST row limit from silently truncating a large
-- ladder board. The game-indexed read is cached once for all viewers.
create function public.read_nba_quote_openings(p_game_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.player_id,q.vendor,q.market,q.market_type,q.line,q.side),'[]'::jsonb)
  from public.nba_quote_openings q where q.game_id=p_game_id;
$$;

revoke all on function public.nba_player_opening_quotes(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.nba_game_opening_quotes(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.nba_keep_player_openings() from public,anon,authenticated;
revoke all on function public.record_nba_game_market_capture(bigint,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.read_nba_quote_openings(bigint) from public,anon,authenticated;
grant execute on function public.nba_player_opening_quotes(bigint,jsonb) to service_role;
grant execute on function public.nba_game_opening_quotes(bigint,jsonb) to service_role;
grant execute on function public.nba_keep_player_openings() to service_role;
grant execute on function public.record_nba_game_market_capture(bigint,date,text,jsonb) to service_role;
grant execute on function public.read_nba_quote_openings(bigint) to service_role;
