create table public.nba_market_captures (
  id bigint generated always as identity primary key,
  game_id bigint not null,
  game_date date not null,
  captured_at timestamptz not null default now(),
  fingerprint text not null,
  props jsonb not null check(jsonb_typeof(props)='array')
);
create index nba_market_captures_game_time on public.nba_market_captures(game_id,captured_at desc);
alter table public.nba_market_captures enable row level security;
revoke all on public.nba_market_captures from anon, authenticated;
grant select,insert on public.nba_market_captures to service_role;
grant usage,select on sequence public.nba_market_captures_id_seq to service_role;
create function public.record_nba_market_capture(p_game_id bigint,p_game_date date,p_fingerprint text,p_props jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare prior text;
begin
  if jsonb_typeof(p_props)<>'array' or jsonb_array_length(p_props)=0 or jsonb_array_length(p_props)>20000 then raise exception 'Invalid NBA snapshot'; end if;
  perform pg_advisory_xact_lock(p_game_id);
  select fingerprint into prior from public.nba_market_captures where game_id=p_game_id order by captured_at desc,id desc limit 1;
  if prior=p_fingerprint then return false; end if;
  insert into public.nba_market_captures(game_id,game_date,fingerprint,props) values(p_game_id,p_game_date,p_fingerprint,p_props);
  return true;
end $$;
create function public.read_nba_market_captures(p_game_id bigint,p_market text,p_player bigint default null)
returns table(captured_at timestamptz,props jsonb) language sql stable security invoker set search_path='' as $$
  with selected as (
    (select id,captured_at,props from public.nba_market_captures where game_id=p_game_id order by captured_at,id limit 1)
    union
    (select id,captured_at,props from public.nba_market_captures where game_id=p_game_id order by captured_at desc,id desc limit 95)
  ) select s.captured_at,coalesce((select jsonb_agg(q) from jsonb_array_elements(s.props) q where q->>'prop_type'=p_market and (p_player is null or (q->>'player_id')::bigint=p_player)),'[]'::jsonb) from selected s order by s.captured_at,s.id;
$$;
revoke all on function public.record_nba_market_capture(bigint,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.read_nba_market_captures(bigint,text,bigint) from public,anon,authenticated;
grant execute on function public.record_nba_market_capture(bigint,date,text,jsonb) to service_role;
grant execute on function public.read_nba_market_captures(bigint,text,bigint) to service_role;
