-- Dedicated NFL clock and immutable post-kickoff research. No job schedules or old-data rebuilds.
create table if not exists public.nfl_pregame_research (
  game_id text not null,
  resource text not null check (resource ~ '^[a-zA-Z0-9:_-]{1,160}$'),
  version integer not null check (version > 0),
  kickoff_at timestamptz not null check (isfinite(kickoff_at)),
  observed_at timestamptz not null check (isfinite(observed_at)),
  stored_at timestamptz not null default clock_timestamp(),
  payload jsonb not null check (octet_length(payload::text) <= 8388608),
  source text not null default 'capture' check (source in ('capture', 'recovered-cache')),
  source_key text,
  primary key (game_id, resource, version),
  check (observed_at < kickoff_at and observed_at <= stored_at),
  check (source <> 'recovered-cache' or source_key is not null)
);
alter table public.nfl_pregame_research enable row level security;
revoke all on public.nfl_pregame_research from public, anon, authenticated, service_role;
grant select on public.nfl_pregame_research to service_role;

create or replace function public.nfl_research_kickoff(p_game_id text, p_kickoff timestamptz)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select least(p_kickoff,
    (select (s.gameday::text || ' ' || s.gametime::text)::timestamp at time zone 'America/New_York'
       from public.nfl_schedule s where s.game_id = p_game_id and s.gametime is not null),
    (select min(r.kickoff_at) from public.nfl_pregame_research r where r.game_id = p_game_id))
$$;
revoke all on function public.nfl_research_kickoff(text,timestamptz) from public, anon, authenticated;
grant execute on function public.nfl_research_kickoff(text,timestamptz) to service_role;

create or replace function public.read_nfl_pregame_research(p_game_id text,p_resource text,p_version integer,p_kickoff timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cutoff timestamptz; result jsonb;
begin
  if p_game_id is null or p_resource !~ '^[a-zA-Z0-9:_-]{1,160}$' or p_version < 1 or not isfinite(p_kickoff) then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nfl-research:' || p_game_id,0));
  cutoff := public.nfl_research_kickoff(p_game_id,p_kickoff);
  select jsonb_build_object('payload',r.payload,'observed_at',r.observed_at,'kickoff_at',least(r.kickoff_at,cutoff),'source',r.source)
    into result from public.nfl_pregame_research r
    where r.game_id=p_game_id and r.resource=p_resource and r.version=p_version
      and r.observed_at < cutoff and r.observed_at <= clock_timestamp();
  return result;
end $$;
revoke all on function public.read_nfl_pregame_research(text,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.read_nfl_pregame_research(text,text,integer,timestamptz) to service_role;

create or replace function public.capture_nfl_pregame_research(p_game_id text,p_resource text,p_version integer,p_kickoff timestamptz,p_observed_at timestamptz,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz; existing public.nfl_pregame_research%rowtype;
begin
  if p_game_id is null or p_resource is null or p_resource !~ '^[a-zA-Z0-9:_-]{1,160}$' or p_version is null or p_version < 1
    or p_kickoff is null or not isfinite(p_kickoff) or p_observed_at is null or not isfinite(p_observed_at)
    or p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8388608 then raise exception 'Invalid NFL research snapshot'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nfl-research:' || p_game_id,0));
  -- A service caller cannot invent a kickoff for an unknown/untimed canonical game.
  if not exists(select 1 from public.nfl_schedule where game_id=p_game_id and gametime is not null) then return null; end if;
  cutoff := public.nfl_research_kickoff(p_game_id,p_kickoff);
  select * into existing from public.nfl_pregame_research where game_id=p_game_id and resource=p_resource and version=p_version;
  if clock_timestamp() >= cutoff or p_observed_at >= cutoff or p_observed_at > clock_timestamp()
    or (existing.observed_at is not null and p_observed_at <= existing.observed_at)
    or (p_resource='odds:v1' and (p_payload->>'status' is distinct from 'ready' or jsonb_array_length(coalesce(p_payload->'players','[]'::jsonb))=0))
    or (p_resource like '%lens:%' and p_payload->>'status' is distinct from 'calculated')
    or (p_resource like 'slate-%' and p_payload->>'complete' is distinct from 'true') then
    return public.read_nfl_pregame_research(p_game_id,p_resource,p_version,cutoff);
  end if;
  insert into public.nfl_pregame_research(game_id,resource,version,kickoff_at,observed_at,payload)
    values(p_game_id,p_resource,p_version,cutoff,p_observed_at,p_payload)
    on conflict(game_id,resource,version) do update set kickoff_at=excluded.kickoff_at,observed_at=excluded.observed_at,
      stored_at=clock_timestamp(),payload=excluded.payload,source='capture',source_key=null;
  return public.read_nfl_pregame_research(p_game_id,p_resource,p_version,cutoff);
end $$;
revoke all on function public.capture_nfl_pregame_research(text,text,integer,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.capture_nfl_pregame_research(text,text,integer,timestamptz,timestamptz,jsonb) to service_role;
