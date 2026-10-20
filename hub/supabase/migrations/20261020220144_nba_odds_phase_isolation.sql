-- Apply individually after review. Existing NBA tapes and openings are preserved.
set local lock_timeout = '5s';
do $$ begin
  if to_regclass('public.nba_market_captures') is null or to_regclass('public.nba_game_market_captures') is null
    or to_regclass('public.nba_first_basket_captures') is null or to_regclass('public.nba_quote_openings') is null
    or to_regprocedure('public.nba_player_opening_quotes(bigint,jsonb)') is null
    or to_regprocedure('public.nba_game_opening_quotes(bigint,jsonb)') is null then
    raise exception 'NBA phase prerequisites missing';
  end if;
end $$;

create table public.nba_odds_phase_games (
  game_id bigint primary key check(game_id>0),
  tipoff_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table public.nba_odds_phase_captures (
  id bigint generated always as identity primary key,
  game_id bigint not null check(game_id>0), game_date date not null,
  mode text not null check(mode in ('pregame','live')),
  feed text not null check(feed in ('props','game','first')),
  captured_at timestamptz not null default now(),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  quotes jsonb not null check(jsonb_typeof(quotes)='array')
);
create index nba_odds_phase_captures_lookup on public.nba_odds_phase_captures(game_id,mode,feed,captured_at desc,id desc);
create table public.nba_odds_phase_openings (
  game_id bigint not null,mode text not null check(mode in ('pregame','live')),
  player_id bigint not null,vendor text not null,market text not null,market_type text not null,
  line numeric not null,side text not null,odds integer not null,observed_at timestamptz not null,
  primary key(game_id,mode,player_id,vendor,market,market_type,line,side)
);
alter table public.nba_odds_phase_games enable row level security;
alter table public.nba_odds_phase_captures enable row level security;
alter table public.nba_odds_phase_openings enable row level security;
revoke all on public.nba_odds_phase_games,public.nba_odds_phase_captures,public.nba_odds_phase_openings from public,anon,authenticated,service_role;
grant select,insert,update on public.nba_odds_phase_games to service_role;
grant select,insert on public.nba_odds_phase_captures,public.nba_odds_phase_openings to service_role;
grant usage,select on sequence public.nba_odds_phase_captures_id_seq to service_role;

create function public.nba_phase_quote_time(p_value text) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return null; end if;
  return p_value::timestamptz;
exception when others then return null;
end $$;
create function public.nba_phase_cutoff(p_game_id bigint,p_tipoff timestamptz) returns timestamptz
language sql stable security invoker set search_path='' as $$
 select case when p_tipoff is null then null else least(p_tipoff,(select tipoff_at from public.nba_odds_phase_games where game_id=p_game_id)) end;
$$;
create function public.nba_phase_quotes(p_quotes jsonb,p_mode text,p_tipoff timestamptz,p_observed timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(q),'[]'::jsonb) from jsonb_array_elements(p_quotes) q
 where public.nba_phase_quote_time(q->>'updated_at')<=p_observed
 and ((p_mode='pregame' and public.nba_phase_quote_time(q->>'updated_at')<p_tipoff)
   or (p_mode='live' and public.nba_phase_quote_time(q->>'updated_at')>=p_tipoff));
$$;

create function public.record_nba_phase_capture(p_game_id bigint,p_game_date date,p_mode text,p_feed text,p_tipoff timestamptz,p_fingerprint text,p_quotes jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare prior text; stamp timestamptz:=clock_timestamp(); cutoff timestamptz;
begin
 if p_game_id is null or p_game_id<=0 or p_game_date is null or p_mode not in ('pregame','live') or p_mode is null
   or p_feed not in ('props','game','first') or p_feed is null or p_tipoff is null
   or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_quotes is null
   or jsonb_typeof(p_quotes)<>'array' or jsonb_array_length(p_quotes)>20000 then raise exception 'Invalid NBA phase snapshot'; end if;
 perform pg_advisory_xact_lock(p_game_id);
 stamp:=clock_timestamp();
 -- A schedule correction can move a future game. A passed cutoff never reopens.
 insert into public.nba_odds_phase_games(game_id,tipoff_at) values(p_game_id,p_tipoff)
 on conflict(game_id) do update set tipoff_at=case when public.nba_odds_phase_games.tipoff_at>stamp
   then excluded.tipoff_at else least(public.nba_odds_phase_games.tipoff_at,excluded.tipoff_at) end,updated_at=stamp;
 cutoff:=public.nba_phase_cutoff(p_game_id,p_tipoff);
 if (p_mode='pregame' and stamp>=cutoff) or (p_mode='live' and stamp<cutoff) then raise exception 'NBA snapshot crossed phase boundary'; end if;
 if exists(select 1 from jsonb_array_elements(p_quotes) q where
   (p_feed<>'game' and q->>'game_id' is distinct from p_game_id::text)
   or (p_feed='game' and q->>'game_id' is not null and q->>'game_id'<>p_game_id::text)) then raise exception 'NBA phase identity mismatch'; end if;
 if public.nba_phase_quotes(p_quotes,p_mode,cutoff,stamp)<>p_quotes then raise exception 'NBA quote outside capture phase'; end if;
 if p_feed='first' and exists(select 1 from jsonb_array_elements(p_quotes) q where
   q->>'prop_type' is null or q->>'prop_type' not in ('first_score','first_field_goal','team_first_score','team_first_field_goal','first_score_2pt','first_score_3pt','first_score_free_throw','first_score_dunk','first_score_layup','first_score_other')
   or q->'market'->>'type' is distinct from 'over_under' or q->>'line_value' is distinct from '0.5') then raise exception 'NBA first-event identity mismatch'; end if;
 if jsonb_array_length(p_quotes)>0 and ((p_feed='game' and not exists(select 1 from public.nba_game_opening_quotes(p_game_id,p_quotes)))
   or (p_feed<>'game' and not exists(select 1 from public.nba_player_opening_quotes(p_game_id,p_quotes)))) then raise exception 'NBA snapshot has no valid quotes'; end if;
 select fingerprint into prior from public.nba_odds_phase_captures where game_id=p_game_id and mode=p_mode and feed=p_feed order by captured_at desc,id desc limit 1;
 if prior=p_fingerprint then return false; end if;
 -- Even a first empty observation is retained: it is an explicit withdrawn/unposted feed.
 insert into public.nba_odds_phase_captures(game_id,game_date,mode,feed,captured_at,fingerprint,quotes) values(p_game_id,p_game_date,p_mode,p_feed,stamp,p_fingerprint,p_quotes);
 if p_feed='game' then
   insert into public.nba_odds_phase_openings(game_id,mode,player_id,vendor,market,market_type,line,side,odds,observed_at)
   select p_game_id,p_mode,0,q.vendor,q.market,'game',q.line,'over',q.odds,stamp from public.nba_game_opening_quotes(p_game_id,p_quotes) q order by q.vendor,q.market,q.line,q.odds on conflict do nothing;
 else
   insert into public.nba_odds_phase_openings(game_id,mode,player_id,vendor,market,market_type,line,side,odds,observed_at)
   select p_game_id,p_mode,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds,stamp from public.nba_player_opening_quotes(p_game_id,p_quotes) q order by q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds on conflict do nothing;
 end if;
 return true;
end $$;

create function public.read_nba_phase_frames(p_game_id bigint,p_mode text,p_feed text,p_tipoff timestamptz)
returns table(captured_at timestamptz,quotes jsonb,fingerprint text)
language sql stable security invoker set search_path='' as $$
 with boundary as (select public.nba_phase_cutoff(p_game_id,p_tipoff) as cutoff), eligible as (
   select c.id,c.captured_at,c.quotes,c.fingerprint,1 as source from public.nba_odds_phase_captures c,boundary b
   where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed
     and ((p_mode='pregame' and c.captured_at<b.cutoff) or (p_mode='live' and c.captured_at>=b.cutoff))
   union all
   select c.id,c.captured_at,c.props,c.fingerprint,0 from public.nba_market_captures c,boundary b
   where p_mode='pregame' and p_feed='props' and c.game_id=p_game_id and c.captured_at<b.cutoff
   union all
   select c.id,c.captured_at,c.odds,c.fingerprint,0 from public.nba_game_market_captures c,boundary b
   where p_mode='pregame' and p_feed='game' and c.game_id=p_game_id and c.captured_at<b.cutoff
   union all
   select c.id,c.captured_at,c.props,c.fingerprint,0 from public.nba_first_basket_captures c,boundary b
   where p_mode='pregame' and p_feed='first' and c.game_id=p_game_id and c.captured_at<b.cutoff
 ), selected as (
   (select * from eligible order by captured_at,id,source limit 1)
   union
   (select * from eligible order by captured_at desc,id desc,source desc limit 95)
 ) select s.captured_at,public.nba_phase_quotes(s.quotes,p_mode,b.cutoff,s.captured_at),s.fingerprint
 from selected s cross join boundary b order by s.captured_at,s.id,s.source;
$$;

-- Snapshot/state readers select one/two raw rows with indexed bounded branches;
-- they do not expand all 96 history payloads to filter quote timestamps.
create function public.read_nba_phase_recent(p_game_id bigint,p_mode text,p_feed text,p_tipoff timestamptz,p_count integer)
returns table(captured_at timestamptz,quotes jsonb,fingerprint text)
language sql stable security invoker set search_path='' as $$
 with boundary as (select public.nba_phase_cutoff(p_game_id,p_tipoff) as cutoff), eligible as (
   (select c.id,c.captured_at,c.quotes,c.fingerprint,1 as source from public.nba_odds_phase_captures c,boundary b
    where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed
    and ((p_mode='pregame' and c.captured_at<b.cutoff) or(p_mode='live' and c.captured_at>=b.cutoff))
    order by c.captured_at desc,c.id desc limit greatest(1,least(2,p_count)))
   union all
   (select c.id,c.captured_at,c.props,c.fingerprint,0 from public.nba_market_captures c,boundary b
    where p_mode='pregame' and p_feed='props' and c.game_id=p_game_id and c.captured_at<b.cutoff
    order by c.captured_at desc,c.id desc limit greatest(1,least(2,p_count)))
   union all
   (select c.id,c.captured_at,c.odds,c.fingerprint,0 from public.nba_game_market_captures c,boundary b
    where p_mode='pregame' and p_feed='game' and c.game_id=p_game_id and c.captured_at<b.cutoff
    order by c.captured_at desc,c.id desc limit greatest(1,least(2,p_count)))
   union all
   (select c.id,c.captured_at,c.props,c.fingerprint,0 from public.nba_first_basket_captures c,boundary b
    where p_mode='pregame' and p_feed='first' and c.game_id=p_game_id and c.captured_at<b.cutoff
    order by c.captured_at desc,c.id desc limit greatest(1,least(2,p_count)))
 ), selected as (select * from eligible order by captured_at desc,id desc,source desc limit greatest(1,least(2,p_count)))
 select s.captured_at,public.nba_phase_quotes(s.quotes,p_mode,b.cutoff,s.captured_at),s.fingerprint
 from selected s cross join boundary b order by s.captured_at,s.id,s.source;
$$;

create function public.read_nba_phase_snapshot(p_game_id bigint,p_mode text,p_tipoff timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('feed',f.feed,'captured_at',s.captured_at,'quotes',s.quotes,'fingerprint',s.fingerprint)),'[]'::jsonb)
 from (values('props'),('game'),('first')) f(feed)
 cross join lateral (select * from public.read_nba_phase_recent(p_game_id,p_mode,f.feed,p_tipoff,1) order by captured_at desc limit 1) s;
$$;

create function public.read_nba_phase_openings(p_game_id bigint,p_mode text,p_tipoff timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 with boundary as (select public.nba_phase_cutoff(p_game_id,p_tipoff) as cutoff), eligible as (
   select q.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds,q.observed_at
   from public.nba_odds_phase_openings q,boundary b where q.game_id=p_game_id and q.mode=p_mode
   and ((p_mode='pregame' and q.observed_at<b.cutoff) or (p_mode='live' and q.observed_at>=b.cutoff))
   union all
   select q.game_id,q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds,q.observed_at
   from public.nba_quote_openings q,boundary b where p_mode='pregame' and q.game_id=p_game_id and q.observed_at<b.cutoff
 ), firsts as (
   select distinct on(game_id,player_id,vendor,market,market_type,line,side) * from eligible
   order by game_id,player_id,vendor,market,market_type,line,side,observed_at,odds
 ) select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from firsts q;
$$;

create function public.read_nba_phase_first_state(p_game_id bigint,p_mode text,p_tipoff timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 with boundary as (select public.nba_phase_cutoff(p_game_id,p_tipoff) as cutoff), totals as (
 select count(*) as n from public.nba_odds_phase_captures c,boundary b where c.game_id=p_game_id and c.feed='first' and c.mode=p_mode
 and ((p_mode='pregame' and c.captured_at<b.cutoff) or(p_mode='live' and c.captured_at>=b.cutoff))
 union all
 select count(*) from public.nba_first_basket_captures c,boundary b where p_mode='pregame' and c.game_id=p_game_id and c.captured_at<b.cutoff
 ) select jsonb_build_object('captures',(select sum(n) from totals),'frames',coalesce((
 select jsonb_agg(jsonb_build_object('captured_at',s.captured_at,'props',s.quotes) order by s.captured_at)
 from(select * from public.read_nba_phase_recent(p_game_id,p_mode,'first',p_tipoff,2) order by captured_at desc limit 2)s),'[]'::jsonb));
$$;

revoke all on function public.nba_phase_quote_time(text),public.nba_phase_cutoff(bigint,timestamptz),public.nba_phase_quotes(jsonb,text,timestamptz,timestamptz),public.record_nba_phase_capture(bigint,date,text,text,timestamptz,text,jsonb),public.read_nba_phase_frames(bigint,text,text,timestamptz),public.read_nba_phase_snapshot(bigint,text,timestamptz),public.read_nba_phase_recent(bigint,text,text,timestamptz,integer),public.read_nba_phase_openings(bigint,text,timestamptz),public.read_nba_phase_first_state(bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.nba_phase_quote_time(text),public.nba_phase_cutoff(bigint,timestamptz),public.nba_phase_quotes(jsonb,text,timestamptz,timestamptz),public.record_nba_phase_capture(bigint,date,text,text,timestamptz,text,jsonb),public.read_nba_phase_frames(bigint,text,text,timestamptz),public.read_nba_phase_snapshot(bigint,text,timestamptz),public.read_nba_phase_recent(bigint,text,text,timestamptz,integer),public.read_nba_phase_openings(bigint,text,timestamptz),public.read_nba_phase_first_state(bigint,text,timestamptz) to service_role;
