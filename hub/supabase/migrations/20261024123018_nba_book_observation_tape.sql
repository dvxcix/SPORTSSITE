-- Apply only this reviewed repair. No historical observations are backfilled.
set local lock_timeout='5s';
do $$ begin
 if to_regclass('public.nba_source_cache') is null
 or to_regclass('public.nba_odds_phase_games') is null
 or to_regclass('public.nba_odds_phase_openings') is null
 or to_regprocedure('public.nba_player_opening_quotes(bigint,jsonb)') is null
 or to_regprocedure('public.nba_phase_cutoff(bigint,timestamptz)') is null
 or to_regprocedure('public.read_nba_phase_frames_scoped(bigint,text,text,timestamptz,text,text,bigint,timestamptz)') is null
 or to_regclass('public.nba_book_quote_scopes') is not null
 or to_regclass('public.nba_book_quote_captures') is not null then
  raise exception 'NBA book tape prerequisites changed; review before applying';
 end if;
end $$;

create table public.nba_book_quote_scopes(
 game_id bigint not null check(game_id>0),mode text not null check(mode='pregame'),
 feed text not null check(feed in('props','first')),book text not null check(book in('betmgm','draftkings')),
 market text not null check(market ~ '^[a-z0-9_]{1,64}$'),market_type text not null check(market_type in('milestone','over_under')),
 line numeric not null check(line>=0 and line<=300),first_observed_at timestamptz not null,last_observed_at timestamptz not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{32}$'),
 primary key(game_id,mode,feed,book,market,market_type,line)
);
create table public.nba_book_quote_captures(
 id bigint generated always as identity primary key,
 game_id bigint not null,game_date date not null,mode text not null,feed text not null,book text not null,
 market text not null,market_type text not null,line numeric not null,
 observed_at timestamptz not null,received_at timestamptz not null default clock_timestamp(),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{32}$'),quotes jsonb not null check(jsonb_typeof(quotes)='array' and jsonb_array_length(quotes)<=100),
 foreign key(game_id,mode,feed,book,market,market_type,line) references public.nba_book_quote_scopes(game_id,mode,feed,book,market,market_type,line)
);
create unique index nba_book_quote_captures_scope_time on public.nba_book_quote_captures(game_id,mode,feed,book,market,market_type,line,observed_at desc);
create index nba_book_quote_captures_time on public.nba_book_quote_captures(game_id,mode,feed,observed_at desc,id desc);
create index nba_book_quote_captures_market_time on public.nba_book_quote_captures(game_id,mode,feed,market,observed_at desc,id desc);
alter table public.nba_book_quote_scopes enable row level security;
alter table public.nba_book_quote_captures enable row level security;
revoke all on public.nba_book_quote_scopes,public.nba_book_quote_captures from public,anon,authenticated,service_role;
revoke all on sequence public.nba_book_quote_captures_id_seq from public,anon,authenticated,service_role;
grant select,insert,update on public.nba_book_quote_scopes to service_role;
grant select,insert on public.nba_book_quote_captures to service_role;
grant usage,select on sequence public.nba_book_quote_captures_id_seq to service_role;

-- Cache and tape commit together. Incomplete cache frames retain old quote
-- timestamps but never become authoritative complete-contract observations.
create function public.record_nba_book_frames(p_game_id bigint,p_game_date date,p_tipoff timestamptz,p_feed text,p_book text,p_frames jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;cutoff timestamptz;frame jsonb;quote jsonb;props jsonb;prior jsonb;economic jsonb;
 market_name text;market_kind text;threshold numeric;observed timestamptz;quote_time timestamptz;complete boolean;
 cache_key text;seen text[]:='{}';side_keys text[];side_key text;expected_sides integer;field text;price numeric;fingerprint_value text;last_time timestamptz;last_fingerprint text;
 captures integer:=0;unchanged integer:=0;cached integer:=0;
begin
 if p_game_id is null or p_game_id<=0 or p_game_date is null or p_tipoff is null
 or p_feed is null or p_feed not in('props','first') or p_book is null or p_book not in('betmgm','draftkings')
 or (p_feed='props' and p_book<>'betmgm') or p_frames is null or jsonb_typeof(p_frames)<>'array'
 or jsonb_array_length(p_frames)<1 or jsonb_array_length(p_frames)>(case when p_feed='first' then 1 else 160 end) then
  raise exception 'Invalid NBA book capture';
 end if;
 perform pg_advisory_xact_lock(p_game_id);
 stamp:=clock_timestamp();
 insert into public.nba_odds_phase_games(game_id,tipoff_at) values(p_game_id,p_tipoff)
 on conflict(game_id) do update set tipoff_at=case when public.nba_odds_phase_games.tipoff_at>stamp then excluded.tipoff_at
 else least(public.nba_odds_phase_games.tipoff_at,excluded.tipoff_at) end,updated_at=stamp;
 cutoff:=public.nba_phase_cutoff(p_game_id,p_tipoff);
 if stamp>=cutoff then raise exception 'NBA book capture crossed phase boundary';end if;
 for frame in select value from jsonb_array_elements(p_frames) loop
  observed:=public.nba_phase_quote_time(frame->>'observedAt');props:=frame->'props';
  if jsonb_typeof(frame)<>'object' or frame->>'gameId' is distinct from p_game_id::text or frame->>'book' is distinct from p_book
  or public.nba_phase_quote_time(frame->>'tipoff') is distinct from p_tipoff or jsonb_typeof(frame->'complete') is distinct from 'boolean'
  or observed is null or observed>stamp or observed<stamp-interval '5 minutes' or observed>=cutoff
  or props is null or jsonb_typeof(props)<>'array' or jsonb_array_length(props)>100 then raise exception 'Invalid NBA book observation';end if;
  complete:=(frame->>'complete')::boolean;
  if p_feed='first' then
   market_name:=case when p_book='draftkings' then 'first_score' else 'first_field_goal' end;market_kind:='over_under';threshold:=0.5;
   if not complete then raise exception 'Incomplete First Basket frame';end if;
   cache_key:='book-first:v1:'||p_game_id||':'||floor(extract(epoch from p_tipoff)*1000)::bigint||':'||p_book;
  else
   market_name:=frame->'contract'->>'market';market_kind:=frame->'contract'->>'type';
   if jsonb_typeof(frame->'contract'->'line') is distinct from 'number' then raise exception 'Invalid NBA book line';end if;
   threshold:=(frame->'contract'->>'line')::numeric;
   if market_name is null or market_name not in('points','rebounds','assists','threes','points_rebounds_assists','points_rebounds','points_assists','rebounds_assists','steals','blocks','turnovers','double_double','triple_double','points_1q','rebounds_1q','assists_1q','points_first3min','rebounds_first3min','assists_first3min')
   or market_kind is null or market_kind not in('milestone','over_under') or threshold<0 or threshold>300
   or (market_kind='milestone' and (threshold<=0 or trunc(threshold)<>threshold)) then raise exception 'Invalid NBA book contract';end if;
   cache_key:='book-props:v1:'||p_game_id||':'||floor(extract(epoch from p_tipoff)*1000)::bigint||':'||p_book||':'||market_name||':'||market_kind||':'||trim_scale(threshold)::text;
  end if;
  if cache_key=any(seen) then raise exception 'Duplicate NBA book contract';end if;seen:=array_append(seen,cache_key);
  side_keys:='{}';expected_sides:=0;
  for quote in select value from jsonb_array_elements(props) loop
   quote_time:=public.nba_phase_quote_time(quote->>'updated_at');
   if jsonb_typeof(quote)<>'object' or quote->>'game_id' is distinct from p_game_id::text or quote->>'vendor' is distinct from p_book
   or quote->>'prop_type' is distinct from market_name or quote->>'line_value' is distinct from trim_scale(threshold)::text
   or quote->'market'->>'type' is distinct from market_kind or jsonb_typeof(quote->'player_id') is distinct from 'number'
   or quote->>'player_id' !~ '^[1-9][0-9]{0,12}$'
   or jsonb_typeof(quote->'id') is distinct from 'number' or quote->>'id' !~ '^-[0-9]+$'
   or (quote->>'id')::numeric < -9007199254740991 or (quote->>'id')::numeric > (case when p_feed='first' then -3000000000000 else -5000000000000 end)
   or quote_time is null or quote_time>observed or quote_time>=cutoff or (complete and quote_time<>observed) then raise exception 'NBA book quote identity mismatch';end if;
   if market_kind='milestone' then
    if quote->'market'->>'over_odds' is not null or quote->'market'->>'under_odds' is not null or quote->'market'->>'odds' is null then raise exception 'Invalid NBA milestone side';end if;
   else
    if quote->'market'->>'odds' is not null or (quote->'market'->>'over_odds' is null and quote->'market'->>'under_odds' is null)
    or (p_feed='first' and quote->'market'->>'under_odds' is not null) then raise exception 'Invalid NBA book side';end if;
   end if;
   foreach field in array array['odds','over_odds','under_odds'] loop
    if quote->'market'->>field is not null then
     if jsonb_typeof(quote->'market'->field)<>'number' then raise exception 'Invalid NBA book price';end if;
     price:=(quote->'market'->>field)::numeric;
     if price<>trunc(price) or abs(price)<100 or abs(price)>1000000 then raise exception 'Invalid NBA book price';end if;
     side_key:=(quote->>'player_id')||':'||case when field='under_odds' then 'under' else 'over' end;
     if side_key=any(side_keys) then raise exception 'Duplicate NBA book quote';end if;
     side_keys:=array_append(side_keys,side_key);expected_sides:=expected_sides+1;
    end if;
   end loop;
  end loop;
  if (select count(*) from public.nba_player_opening_quotes(p_game_id,props))<>expected_sides then raise exception 'NBA book opening normalization mismatch';end if;
  select payload into prior from public.nba_source_cache where key=cache_key for update;
  if prior is not null and public.nba_phase_quote_time(prior->>'observedAt')>observed then raise exception 'Older NBA book observation';end if;
  if prior is not null and public.nba_phase_quote_time(prior->>'observedAt')=observed and prior<>frame then raise exception 'Conflicting NBA book observation';end if;
  insert into public.nba_source_cache(key,payload,fetched_at,expires_at,lease_token,lease_until)
  values(cache_key,frame,observed,observed+interval '5 minutes',null,null)
  on conflict(key) do update set payload=excluded.payload,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,lease_token=null,lease_until=null;
  cached:=cached+1;
  if not complete then continue;end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.player_id,q.vendor,q.market,q.market_type,q.line,q.side),'[]'::jsonb)
  into economic from public.nba_player_opening_quotes(p_game_id,props) q;
  fingerprint_value:=md5(economic::text);
  select last_observed_at,fingerprint into last_time,last_fingerprint from public.nba_book_quote_scopes
  where game_id=p_game_id and mode='pregame' and feed=p_feed and book=p_book and market=market_name and market_type=market_kind and line=threshold;
  if last_time>observed or (last_time=observed and last_fingerprint<>fingerprint_value) then raise exception 'Conflicting NBA book tape observation';end if;
  if last_time is null and (select count(*) from public.nba_book_quote_scopes where game_id=p_game_id and mode='pregame' and feed=p_feed)>=(case when p_feed='first' then 2 else 160 end) then raise exception 'NBA book contract budget exceeded';end if;
  insert into public.nba_book_quote_scopes(game_id,mode,feed,book,market,market_type,line,first_observed_at,last_observed_at,fingerprint)
  values(p_game_id,'pregame',p_feed,p_book,market_name,market_kind,threshold,observed,observed,fingerprint_value)
  on conflict(game_id,mode,feed,book,market,market_type,line) do update set last_observed_at=excluded.last_observed_at,fingerprint=excluded.fingerprint;
  -- A newly observed unchanged price is still a real observation: it may reopen
  -- a contract after a later complete-feed absence. Deduplicate only retries.
  if last_time is distinct from observed then
   insert into public.nba_book_quote_captures(game_id,game_date,mode,feed,book,market,market_type,line,observed_at,received_at,fingerprint,quotes)
   values(p_game_id,p_game_date,'pregame',p_feed,p_book,market_name,market_kind,threshold,observed,stamp,fingerprint_value,props);
   captures:=captures+1;
  else unchanged:=unchanged+1;end if;
  insert into public.nba_odds_phase_openings(game_id,mode,player_id,vendor,market,market_type,line,side,odds,observed_at)
  select p_game_id,'pregame',q.player_id,q.vendor,q.market,q.market_type,q.line,q.side,q.odds,observed
  from public.nba_player_opening_quotes(p_game_id,props) q order by q.player_id,q.vendor,q.market,q.market_type,q.line,q.side on conflict do nothing;
 end loop;
 return jsonb_build_object('cached',cached,'captured',captures,'unchanged',unchanged);
end $$;

-- Select combined metadata before JSON. Each selected event receives its
-- indexed base predecessor and latest complete state of every exact book scope.
create function public.read_nba_book_frames(p_game_id bigint,p_mode text,p_feed text,p_tipoff timestamptz,p_selection text,p_market text,p_player_id bigint,p_as_of timestamptz)
returns table(captured_at timestamptz,quotes jsonb,fingerprint text,base_captured_at timestamptz,book_contracts jsonb,base_absence_complete boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game_id is null or p_game_id<=0 or p_mode is null or p_mode not in('pregame','live') or p_feed is null or p_feed not in('props','first','game')
 or p_tipoff is null or p_selection is null or p_selection not in('latest','edges','history','recent') or (p_selection='recent' and p_feed<>'first') or (p_market is not null and p_market !~ '^[a-z0-9_]{1,64}$')
 or (p_player_id is not null and p_player_id<=0) then raise exception 'Invalid NBA book history scope';end if;
 if p_selection='recent' then
  return query
  with boundary as materialized(select public.nba_phase_cutoff(p_game_id,p_tipoff) cutoff,least(coalesce(p_as_of,now()),now()) as_of),
  base_candidates as materialized(
   (select c.captured_at as event_at from public.nba_odds_phase_captures c cross join boundary b
    where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed and c.captured_at<=b.as_of
     and ((p_mode='pregame' and c.captured_at<b.cutoff) or (p_mode='live' and c.captured_at>=b.cutoff))
    order by c.captured_at desc,c.id desc limit 2)
   union all
   (select c.captured_at from public.nba_first_basket_captures c cross join boundary b
    where c.game_id=p_game_id and p_mode='pregame' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
    order by c.captured_at desc,c.id desc limit 2)
  ),events as materialized(
   (select distinct b.event_at from base_candidates b order by b.event_at desc limit 2)
   union
   select c.observed_at from public.nba_book_quote_scopes s cross join boundary b
   cross join lateral(select c.observed_at from public.nba_book_quote_captures c
    where c.game_id=s.game_id and c.mode=s.mode and c.feed=s.feed and c.book=s.book and c.market=s.market and c.market_type=s.market_type and c.line=s.line
     and c.observed_at<b.cutoff and c.observed_at<=b.as_of order by c.observed_at desc,c.id desc limit 2)c
   where s.game_id=p_game_id and s.mode=p_mode and s.feed=p_feed and (p_market is null or s.market=p_market)
  )
  select r.* from events e cross join lateral public.read_nba_book_frames(p_game_id,p_mode,p_feed,p_tipoff,'latest',p_market,p_player_id,e.event_at) r
  order by r.captured_at;
  return;
 end if;
 return query
 with boundary as materialized(select public.nba_phase_cutoff(p_game_id,p_tipoff) as cutoff,least(coalesce(p_as_of,now()),now()) as as_of),
 candidates as materialized(
  (select distinct c.observed_at as event_at from public.nba_book_quote_captures c cross join boundary b
   where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed and (p_market is null or c.market=p_market) and c.observed_at<b.cutoff and c.observed_at<=b.as_of
   order by c.observed_at desc limit case when p_selection='history' then 95 else 1 end)
  union all
  (select distinct c.observed_at as event_at from public.nba_book_quote_captures c cross join boundary b
   where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed and (p_market is null or c.market=p_market) and c.observed_at<b.cutoff and c.observed_at<=b.as_of
   order by c.observed_at asc limit case when p_selection='latest' then 0 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_odds_phase_captures c cross join boundary b
   where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed and ((p_mode='pregame' and c.captured_at<b.cutoff) or (p_mode='live' and c.captured_at>=b.cutoff)) and c.captured_at<=b.as_of
   order by c.captured_at desc limit case when p_selection='history' then 95 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_odds_phase_captures c cross join boundary b
   where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed and ((p_mode='pregame' and c.captured_at<b.cutoff) or (p_mode='live' and c.captured_at>=b.cutoff)) and c.captured_at<=b.as_of
   order by c.captured_at asc limit case when p_selection='latest' then 0 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_market_captures c cross join boundary b
   where c.game_id=p_game_id and p_mode='pregame' and p_feed='props' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
   order by c.captured_at desc limit case when p_selection='history' then 95 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_market_captures c cross join boundary b
   where c.game_id=p_game_id and p_mode='pregame' and p_feed='props' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
   order by c.captured_at asc limit case when p_selection='latest' then 0 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_first_basket_captures c cross join boundary b
   where c.game_id=p_game_id and p_mode='pregame' and p_feed='first' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
   order by c.captured_at desc limit case when p_selection='history' then 95 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_first_basket_captures c cross join boundary b
   where c.game_id=p_game_id and p_mode='pregame' and p_feed='first' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
   order by c.captured_at asc limit case when p_selection='latest' then 0 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_game_market_captures c cross join boundary b
   where c.game_id=p_game_id and p_mode='pregame' and p_feed='game' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
   order by c.captured_at desc limit case when p_selection='history' then 95 else 1 end)
  union all
  (select distinct c.captured_at as event_at from public.nba_game_market_captures c cross join boundary b
   where c.game_id=p_game_id and p_mode='pregame' and p_feed='game' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
   order by c.captured_at asc limit case when p_selection='latest' then 0 else 1 end)
 ), times as materialized(select distinct c.event_at from candidates c),events as materialized(
  (select t.event_at from times t order by t.event_at limit case when p_selection='latest' then 0 else 1 end)
  union
  (select t.event_at from times t order by t.event_at desc limit case when p_selection='history' then 95 else 1 end)
 )
 select e.event_at,coalesce(base.quotes,'[]'::jsonb),coalesce(base.fingerprint,md5(coalesce(books.contracts,'[]'::jsonb)::text)),
  base.captured_at,coalesce(books.contracts,'[]'::jsonb),
  case when p_feed<>'first' then true else coalesce(base_empty.verified_empty,false) end
 from events e
 left join lateral public.read_nba_phase_frames_scoped(p_game_id,p_mode,p_feed,p_tipoff,'latest',p_market,p_player_id,e.event_at) base on true
 left join lateral(
  select k.id,k.source from (
   (select c.id,1 as source from public.nba_odds_phase_captures c where p_feed='first' and c.game_id=p_game_id and c.mode=p_mode and c.feed='first' and c.captured_at=base.captured_at order by c.id desc limit 1)
   union all
   (select c.id,0 as source from public.nba_first_basket_captures c where p_feed='first' and p_mode='pregame' and c.game_id=p_game_id and c.captured_at=base.captured_at order by c.id desc limit 1)
  ) k order by k.id desc,k.source desc limit 1
 ) base_key on true
 left join lateral(
  select jsonb_array_length(c.quotes)=0 as verified_empty from public.nba_odds_phase_captures c where base_key.source=1 and c.id=base_key.id
  union all
  select jsonb_array_length(c.props)=0 from public.nba_first_basket_captures c where base_key.source=0 and c.id=base_key.id
 ) base_empty on true
 left join lateral(
  select jsonb_agg(jsonb_build_object('book',s.book,'market',s.market,'market_type',s.market_type,'line',s.line,'observed_at',c.observed_at,
   'quotes',(select coalesce(jsonb_agg(q.value),'[]'::jsonb) from jsonb_array_elements(c.quotes) q(value) where p_player_id is null or q.value->>'player_id'=p_player_id::text))
   order by s.book,s.market,s.market_type,s.line) as contracts
  from public.nba_book_quote_scopes s
  cross join lateral(select c.observed_at,c.quotes from public.nba_book_quote_captures c
   where c.game_id=s.game_id and c.mode=s.mode and c.feed=s.feed and c.book=s.book and c.market=s.market and c.market_type=s.market_type and c.line=s.line
    and c.observed_at<=e.event_at
   order by c.observed_at desc,c.id desc limit 1)c
  where s.game_id=p_game_id and s.mode=p_mode and s.feed=p_feed and (p_market is null or s.market=p_market) and s.first_observed_at<=e.event_at
 ) books on true
 order by e.event_at;
end $$;
revoke all on function public.record_nba_book_frames(bigint,date,timestamptz,text,text,jsonb),public.read_nba_book_frames(bigint,text,text,timestamptz,text,text,bigint,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.record_nba_book_frames(bigint,date,timestamptz,text,text,jsonb),public.read_nba_book_frames(bigint,text,text,timestamptz,text,text,bigint,timestamptz) to service_role;
