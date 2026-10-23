-- Incident repair: bounded metadata selection before quote expansion.
-- All historical tapes and immutable openings remain unchanged.
set local lock_timeout='5s';
do $$ begin
 if to_regprocedure('public.read_nba_phase_frames(bigint,text,text,timestamptz)') is null
 or to_regprocedure('public.nba_phase_cutoff(bigint,timestamptz)') is null
 or to_regprocedure('public.read_nba_phase_frames_scoped(bigint,text,text,timestamptz,text,text,bigint,timestamptz)') is not null then
   raise exception 'NBA scoped-history prerequisites changed; review before applying';
 end if;
end $$;

create function public.read_nba_phase_frames_scoped(
 p_game_id bigint,p_mode text,p_feed text,p_tipoff timestamptz,
 p_selection text,p_market text,p_player_id bigint,p_as_of timestamptz
) returns table(captured_at timestamptz,quotes jsonb,fingerprint text)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_game_id is null or p_game_id<=0 or p_mode is null or p_mode not in ('pregame','live')
 or p_feed is null or p_feed not in ('props','game','first') or p_tipoff is null
 or p_selection is null or p_selection not in ('history','edges','latest')
 or (p_player_id is not null and p_player_id<=0) or (p_market is not null and (length(p_market)>64 or p_market !~ '^[a-z0-9_]+$')) then
   raise exception 'Invalid NBA history scope';
 end if;
 return query
 with boundary as materialized (
   select public.nba_phase_cutoff(p_game_id,p_tipoff) as cutoff,least(coalesce(p_as_of,now()),now()) as as_of
 ), candidates as materialized (
    (select c.id,c.captured_at,c.fingerprint,1 as source from public.nba_odds_phase_captures c cross join boundary b
     where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed and ((p_mode='pregame' and c.captured_at<b.cutoff) or (p_mode='live' and c.captured_at>=b.cutoff)) and c.captured_at<=b.as_of
     order by c.captured_at desc,c.id desc limit case when p_selection='history' then 95 else 1 end)
    union all
    (select c.id,c.captured_at,c.fingerprint,1 as source from public.nba_odds_phase_captures c cross join boundary b
     where c.game_id=p_game_id and c.mode=p_mode and c.feed=p_feed and ((p_mode='pregame' and c.captured_at<b.cutoff) or (p_mode='live' and c.captured_at>=b.cutoff)) and c.captured_at<=b.as_of
     order by c.captured_at asc,c.id asc limit case when p_selection='latest' then 0 else 1 end)
    union all
    (select c.id,c.captured_at,c.fingerprint,0 as source from public.nba_market_captures c cross join boundary b
     where c.game_id=p_game_id and p_mode='pregame' and p_feed='props' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
     order by c.captured_at desc,c.id desc limit case when p_selection='history' then 95 else 1 end)
    union all
    (select c.id,c.captured_at,c.fingerprint,0 as source from public.nba_market_captures c cross join boundary b
     where c.game_id=p_game_id and p_mode='pregame' and p_feed='props' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
     order by c.captured_at asc,c.id asc limit case when p_selection='latest' then 0 else 1 end)
    union all
    (select c.id,c.captured_at,c.fingerprint,2 as source from public.nba_game_market_captures c cross join boundary b
     where c.game_id=p_game_id and p_mode='pregame' and p_feed='game' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
     order by c.captured_at desc,c.id desc limit case when p_selection='history' then 95 else 1 end)
    union all
    (select c.id,c.captured_at,c.fingerprint,2 as source from public.nba_game_market_captures c cross join boundary b
     where c.game_id=p_game_id and p_mode='pregame' and p_feed='game' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
     order by c.captured_at asc,c.id asc limit case when p_selection='latest' then 0 else 1 end)
    union all
    (select c.id,c.captured_at,c.fingerprint,3 as source from public.nba_first_basket_captures c cross join boundary b
     where c.game_id=p_game_id and p_mode='pregame' and p_feed='first' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
     order by c.captured_at desc,c.id desc limit case when p_selection='history' then 95 else 1 end)
    union all
    (select c.id,c.captured_at,c.fingerprint,3 as source from public.nba_first_basket_captures c cross join boundary b
     where c.game_id=p_game_id and p_mode='pregame' and p_feed='first' and c.captured_at<b.cutoff and c.captured_at<=b.as_of
     order by c.captured_at asc,c.id asc limit case when p_selection='latest' then 0 else 1 end)
 ), keys as materialized (
   select distinct on(c.source,c.id) c.id,c.captured_at,c.fingerprint,c.source from candidates c order by c.source,c.id
 ), selected as materialized (
   (select k.* from keys k order by k.captured_at,k.id,case when k.source=1 then 1 else 0 end limit case when p_selection='latest' then 0 else 1 end)
   union
   (select k.* from keys k order by k.captured_at desc,k.id desc,case when k.source=1 then 1 else 0 end desc limit case when p_selection='history' then 95 else 1 end)
 )
 select s.captured_at,coalesce((
   select jsonb_agg(q.value) from jsonb_array_elements(raw.quotes) q(value)
   where (p_market is null or q.value->>'prop_type'=p_market)
     and (p_player_id is null or q.value->>'player_id'=p_player_id::text)
     and public.nba_phase_quote_time(q.value->>'updated_at')<=s.captured_at
     and ((p_mode='pregame' and public.nba_phase_quote_time(q.value->>'updated_at')<b.cutoff)
       or (p_mode='live' and public.nba_phase_quote_time(q.value->>'updated_at')>=b.cutoff))
 ),'[]'::jsonb),s.fingerprint
 from selected s cross join boundary b cross join lateral (
    select c.quotes as quotes from public.nba_odds_phase_captures c where s.source=1 and c.id=s.id
    union all
    select c.props as quotes from public.nba_market_captures c where s.source=0 and c.id=s.id
    union all
    select c.odds as quotes from public.nba_game_market_captures c where s.source=2 and c.id=s.id
    union all
    select c.props as quotes from public.nba_first_basket_captures c where s.source=3 and c.id=s.id
    offset 0
 ) raw
 order by s.captured_at,s.id,case when s.source=1 then 1 else 0 end;
end $$;

-- Old deployments also avoid materializing/sorting every historical JSON payload.
create or replace function public.read_nba_phase_frames(p_game_id bigint,p_mode text,p_feed text,p_tipoff timestamptz)
returns table(captured_at timestamptz,quotes jsonb,fingerprint text)
language sql stable security invoker set search_path='' as $$
 select * from public.read_nba_phase_frames_scoped(p_game_id,p_mode,p_feed,p_tipoff,'history',null,null,null);
$$;
revoke all on function public.read_nba_phase_frames_scoped(bigint,text,text,timestamptz,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.read_nba_phase_frames_scoped(bigint,text,text,timestamptz,text,text,bigint,timestamptz) to service_role;
