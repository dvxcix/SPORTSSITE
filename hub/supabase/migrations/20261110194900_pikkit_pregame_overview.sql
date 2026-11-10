-- Archive game-level Pikkit community splits independently of player counts.
-- Only the service collectors can write or read these pregame observations.
set local lock_timeout='2s';
set local statement_timeout='10s';

create table public.pikkit_pregame_overviews (
  sport text not null check (sport in ('nba','nfl')),
  game_id text not null,
  source_event_id text not null check (source_event_id ~ '^[a-z0-9-]{1,80}$'),
  observed_at timestamptz not null check (isfinite(observed_at)),
  cutoff_at timestamptz not null check (isfinite(cutoff_at) and observed_at<cutoff_at),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=120000),
  primary key (sport,game_id,observed_at)
);
alter table public.pikkit_pregame_overviews enable row level security;
revoke all on public.pikkit_pregame_overviews from public,anon,authenticated,service_role;
grant select on public.pikkit_pregame_overviews to service_role;

create function public.record_pikkit_pregame_overview(
  p_sport text, p_game_id text, p_event_id text, p_observed_at timestamptz,
  p_source_start timestamptz, p_snapshot jsonb
) returns boolean language plpgsql security definer set search_path='' as $function$
declare
  cutoff timestamptz;
begin
  if p_event_id is null or p_event_id !~ '^[a-z0-9-]{1,80}$'
    or p_observed_at is null or not isfinite(p_observed_at)
    or p_source_start is null or not isfinite(p_source_start)
    or p_observed_at>clock_timestamp() or p_observed_at>=p_source_start
    or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
    or octet_length(p_snapshot::text)>120000
  then return false; end if;

  if p_sport='nba' and p_game_id ~ '^[1-9][0-9]{0,9}$' then
    if not pg_try_advisory_xact_lock(81051,(p_game_id::bigint % 2147483647)::integer)
      or not pg_try_advisory_xact_lock(p_game_id::bigint) then return false; end if;
    select public.nba_phase_cutoff(g.id,least((g.payload->>'datetime')::timestamptz,p_source_start))
      into cutoff from public.nba_games g
      where g.id=p_game_id::bigint and g.payload->>'datetime' is not null
        and coalesce(g.payload->>'status_state','unknown') in ('scheduled','unknown');
  elsif p_sport='nfl' and p_game_id ~ '^[A-Za-z0-9_-]{1,80}$' then
    if not pg_try_advisory_xact_lock(hashtextextended('nfl-research:' || p_game_id,0))
      then return false; end if;
    select public.nfl_research_kickoff(s.game_id,p_source_start)
      into cutoff from public.nfl_schedule s
      where s.game_id=p_game_id and s.gametime is not null and s.away_score is null and s.home_score is null;
  end if;
  if cutoff is null or clock_timestamp()>=cutoff or p_observed_at>=cutoff then return false; end if;

  insert into public.pikkit_pregame_overviews(sport,game_id,source_event_id,observed_at,cutoff_at,snapshot)
    values(p_sport,p_game_id,p_event_id,p_observed_at,cutoff,p_snapshot)
    on conflict (sport,game_id,observed_at) do nothing;
  return true;
end $function$;

revoke all on function public.record_pikkit_pregame_overview(text,text,text,timestamptz,timestamptz,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.record_pikkit_pregame_overview(text,text,text,timestamptz,timestamptz,jsonb)
  to service_role;

