-- Pregame research is durable and independent of ephemeral source-cache expiry.
-- Resource names carry calculation versions; game/market prices remain in the
-- existing phase archive. No historical migrations or collectors are replayed.
create table public.nba_pregame_research (
  game_id bigint not null check (game_id > 0),
  resource text not null check (resource ~ '^[a-zA-Z0-9:_-]{1,160}$'),
  version integer not null check (version > 0),
  tipoff_at timestamptz not null,
  observed_at timestamptz not null,
  stored_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('capture', 'recovered-cache')),
  source_key text,
  payload jsonb not null check (octet_length(payload::text) <= 8388608),
  primary key (game_id, resource, version),
  check (observed_at < tipoff_at),
  check (observed_at <= stored_at),
  check (source <> 'recovered-cache' or source_key is not null)
);
alter table public.nba_pregame_research enable row level security;
revoke all on public.nba_pregame_research from public, anon, authenticated, service_role;
grant select on public.nba_pregame_research to service_role;
comment on table public.nba_pregame_research is 'Service-only pre-tip research inputs. No expiry; closed games cannot be replaced by the application. Recovery preserves original source timestamps and provenance.';

-- A research-only observation also establishes the canonical cutoff. This
-- prevents a later provider schedule from reopening a previously closed game.
create or replace function public.nba_phase_cutoff(p_game_id bigint,p_tipoff timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select case when p_tipoff is null then null else least(p_tipoff,
    (select tipoff_at from public.nba_odds_phase_games where game_id=p_game_id),
    (select min(tipoff_at) from public.nba_pregame_research where game_id=p_game_id)) end;
$$;

create function public.capture_nba_pregame_research(
  p_game_id bigint, p_resource text, p_version integer, p_tipoff timestamptz,
  p_observed_at timestamptz, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cutoff timestamptz;
  current_row public.nba_pregame_research%rowtype;
begin
  if p_game_id is null or p_game_id <= 0 or p_resource is null or p_resource !~ '^[a-zA-Z0-9:_-]{1,160}$'
    or p_version is null or p_version <> 1 or p_tipoff is null or p_observed_at is null or p_payload is null
    or not isfinite(p_tipoff) or not isfinite(p_observed_at)
    or pg_catalog.octet_length(p_payload::text) > 8388608 then
    raise exception 'Invalid pregame research observation' using errcode='22023';
  end if;
  -- Serialize resources for one game, including their first capture, so a later
  -- provider schedule cannot reopen a cutoff already recorded by another view.
  perform pg_catalog.pg_advisory_xact_lock(81051, (p_game_id % 2147483647)::integer);
  select least(p_tipoff, public.nba_phase_cutoff(p_game_id,p_tipoff), min(r.tipoff_at))
    into cutoff from public.nba_pregame_research r where r.game_id=p_game_id;
  select * into current_row from public.nba_pregame_research
    where game_id=p_game_id and resource=p_resource and version=p_version for update;
  -- Check the database wall clock after any lock wait, not transaction start.
  if clock_timestamp() < cutoff and p_observed_at < cutoff and p_observed_at <= clock_timestamp()
    and (current_row.observed_at is null or p_observed_at > current_row.observed_at)
    -- A late partial response may not erase a healthy observation committed
    -- by a concurrent loader while this request was still in flight.
    and not (p_resource='board:v1' and (
      (coalesce(current_row.payload->>'statsComplete','false')='true' and coalesce(p_payload->>'statsComplete','false')<>'true') or
      (coalesce(current_row.payload->>'periodStatsComplete','false')='true' and coalesce(p_payload->>'periodStatsComplete','false')<>'true') or
      (current_row.payload is not null and not (coalesce(current_row.payload->'issues','[]'::jsonb) ?| array['Season averages unavailable','Prior-season averages unavailable','Roster coverage incomplete'])
        and coalesce(p_payload->'issues','[]'::jsonb) ?| array['Season averages unavailable','Prior-season averages unavailable','Roster coverage incomplete'])))
    and not (p_resource='scouting:v1' and (coalesce(current_row.payload->'issues','["missing"]'::jsonb)-'Tracking refresh delayed; showing last captured sample')='[]'::jsonb and (coalesce(p_payload->'issues','["missing"]'::jsonb)-'Tracking refresh delayed; showing last captured sample')<>'[]'::jsonb)
    and not (p_resource='defense:v1' and coalesce(current_row.payload->>'ready','false')='true' and coalesce(p_payload->>'ready','false')<>'true')
    and not (p_resource='tracking:v1' and coalesce(current_row.payload->>'complete','false')='true' and coalesce(p_payload->>'complete','false')<>'true')
    and not (p_resource='profiles:v1' and coalesce(current_row.payload->>'complete','false')='true' and coalesce(p_payload->>'complete','false')<>'true')
    and not (p_resource like 'shots:v1:%' and coalesce(current_row.payload->>'coverageMatches','false')='true' and coalesce(p_payload->>'coverageMatches','false')<>'true')
    and not (p_resource='first-basket:v1' and coalesce(current_row.payload->>'failed','-1')='0'
      and coalesce(current_row.payload->>'requestedGames'=current_row.payload->>'coveredGames',false)
      and (coalesce(p_payload->>'failed','-1')<>'0' or not coalesce(p_payload->>'requestedGames'=p_payload->>'coveredGames',false)))
    and not (p_resource='market-context:v1' and coalesce(current_row.payload->>'available','false')='true' and coalesce(p_payload->>'available','false')<>'true') then
    insert into public.nba_pregame_research(game_id,resource,version,tipoff_at,observed_at,source,payload)
      values(p_game_id,p_resource,p_version,cutoff,p_observed_at,'capture',p_payload)
    on conflict(game_id,resource,version) do update
      set tipoff_at=excluded.tipoff_at,observed_at=excluded.observed_at,stored_at=clock_timestamp(),source='capture',source_key=null,payload=excluded.payload;
    select * into current_row from public.nba_pregame_research
      where game_id=p_game_id and resource=p_resource and version=p_version;
  end if;
  if current_row.observed_at is null or current_row.observed_at >= cutoff then return null; end if;
  return jsonb_build_object('payload',current_row.payload,'observed_at',current_row.observed_at,'tipoff_at',least(current_row.tipoff_at,cutoff),'source',current_row.source);
end;
$$;
revoke all on function public.capture_nba_pregame_research(bigint,text,integer,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.capture_nba_pregame_research(bigint,text,integer,timestamptz,timestamptz,jsonb) to service_role;
