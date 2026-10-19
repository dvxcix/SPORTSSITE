-- NBA-only public activity archive. Read through the gated server route only.
create table public.nba_public_captures (
  id bigint generated always as identity primary key,
  game_id bigint not null,
  game_date date not null,
  captured_at timestamptz not null,
  fingerprint text not null check(length(fingerprint)=64),
  snapshot jsonb not null check(jsonb_typeof(snapshot->'rows')='array'),
  unique(game_id,captured_at)
);
create index nba_public_capture_game_time on public.nba_public_captures(game_id,captured_at desc);
alter table public.nba_public_captures enable row level security;
revoke all on public.nba_public_captures from anon,authenticated;
grant select,insert on public.nba_public_captures to service_role;
grant usage,select on sequence public.nba_public_captures_id_seq to service_role;
create function public.record_nba_public_capture(p_game_id bigint,p_game_date date,p_captured_at timestamptz,p_fingerprint text,p_snapshot jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior text; latest timestamptz;
begin
  if p_game_id<=0 or p_captured_at>now()+interval '1 minute' or p_captured_at<now()-interval '1 hour'
     or jsonb_typeof(p_snapshot->'rows') is distinct from 'array'
     or jsonb_array_length(p_snapshot->'rows') not between 1 and 10000
     or (p_snapshot->>'gameId')::bigint is distinct from p_game_id then
    raise exception 'Invalid NBA public capture';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nba-public:'||p_game_id,0));
  select fingerprint,captured_at into prior,latest from public.nba_public_captures where game_id=p_game_id order by captured_at desc limit 1;
  if latest>=p_captured_at then return false; end if;
  insert into public.nba_public_captures(game_id,game_date,captured_at,fingerprint,snapshot) values(p_game_id,p_game_date,p_captured_at,p_fingerprint,p_snapshot);
  return prior is distinct from p_fingerprint;
end $$;
revoke all on function public.record_nba_public_capture(bigint,date,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_nba_public_capture(bigint,date,timestamptz,text,jsonb) to service_role;
