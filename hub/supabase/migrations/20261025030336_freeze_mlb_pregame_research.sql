-- Primary-project research archive only; existing first-pitch odds remain unchanged.
create table if not exists public.mlb_research_clock (
  game_pk text primary key check (game_pk ~ '^\d+$'),
  start_at timestamptz not null check (isfinite(start_at))
);
create table if not exists public.mlb_pregame_research (
  game_pk text not null references public.mlb_research_clock(game_pk),
  resource text not null check (resource ~ '^(board:v1|pitchlog:\d+|pitcher-window:\d+:([1-9]|10))$'),
  primary key(game_pk,resource),
  version integer not null default 1 check (version=1),
  start_at timestamptz not null check (isfinite(start_at)),
  observed_at timestamptz not null check (isfinite(observed_at)),
  stored_at timestamptz not null default clock_timestamp(),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=8388608),
  source text not null default 'capture' check (source in ('capture','recovered-cache')),
  source_key text,
  check (observed_at < start_at and observed_at <= stored_at),
  check (source <> 'recovered-cache' or source_key is not null)
);
alter table public.mlb_research_clock enable row level security;
alter table public.mlb_pregame_research enable row level security;
revoke all on public.mlb_research_clock,public.mlb_pregame_research from public,anon,authenticated,service_role;
grant select on public.mlb_research_clock,public.mlb_pregame_research to service_role;

-- The earliest server-observed schedule is permanent. A later delay cannot reopen
-- research; a verified earlier first pitch can only move its cutoff earlier.
create or replace function public.mlb_research_start(p_game_pk text,p_start timestamptz)
returns timestamptz language sql stable security invoker set search_path='' as $$
  select least(p_start,
    (select start_at from public.mlb_research_clock where game_pk=p_game_pk),
    (select min(frozen_at) from public.pregame_odds_snapshots where game_pk=p_game_pk and is_frozen),
    (select min(start_at) from public.mlb_pregame_research where game_pk=p_game_pk))
$$;
revoke all on function public.mlb_research_start(text,timestamptz) from public,anon,authenticated;
grant execute on function public.mlb_research_start(text,timestamptz) to service_role;

create or replace function public.read_mlb_pregame_research(p_game_pk text,p_resource text,p_start timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; result jsonb;
begin
  if p_resource is null or p_resource !~ '^(board:v1|pitchlog:\d+|pitcher-window:\d+:([1-9]|10))$' or p_game_pk is null or p_game_pk !~ '^\d+$' or p_start is null or not isfinite(p_start) then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mlb-research:'||p_game_pk,0));
  cutoff := public.mlb_research_start(p_game_pk,p_start);
  insert into public.mlb_research_clock(game_pk,start_at) values(p_game_pk,cutoff)
    on conflict(game_pk) do update set start_at=least(public.mlb_research_clock.start_at,excluded.start_at);
  select jsonb_build_object('payload',payload,'observed_at',observed_at,'start_at',least(start_at,cutoff),'source',source)
    into result from public.mlb_pregame_research where game_pk=p_game_pk and resource=p_resource
      and observed_at<cutoff and observed_at<=clock_timestamp();
  return result;
end $$;
revoke all on function public.read_mlb_pregame_research(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.read_mlb_pregame_research(text,text,timestamptz) to service_role;

-- Compare presence recursively, not the values (real pregame changes are valid).
create or replace function public.mlb_research_keeps_fields(p_old jsonb,p_new jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item record; old_item jsonb; next_item jsonb; identity_keys text[] := array['mlb_id','batter_id','pitcher_id','name_norm','pitch_hand','bat_hand','win','pitch_type','bookmaker','prop_type','game_date','at_bat_number','pitch_number']; k text;
begin
  if p_old is null or p_old='null'::jsonb then return true; end if;
  if p_new is null or p_new='null'::jsonb then return false; end if;
  if jsonb_typeof(p_old)='object' then
    if jsonb_typeof(p_new)<>'object' then return false; end if;
    for item in select key,value from jsonb_each(p_old) loop
      if not public.mlb_research_keeps_fields(item.value,p_new->item.key) then return false; end if;
    end loop;
  elsif jsonb_typeof(p_old)='array' then
    if jsonb_typeof(p_new)<>'array' or jsonb_array_length(p_new)<jsonb_array_length(p_old) then return false; end if;
    for old_item in select value from jsonb_array_elements(p_old) loop
      if jsonb_typeof(old_item)='object' and exists(select 1 from unnest(identity_keys) key where old_item ? key) then
        select candidate into next_item from jsonb_array_elements(p_new) candidate
          where not exists(select 1 from unnest(identity_keys) key where old_item ? key and candidate->key is distinct from old_item->key)
          limit 1;
        if not public.mlb_research_keeps_fields(old_item,next_item) then return false; end if;
      end if;
    end loop;
  end if;
  return true;
end $$;
revoke all on function public.mlb_research_keeps_fields(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mlb_research_keeps_fields(jsonb,jsonb) to service_role;

create or replace function public.capture_mlb_pregame_research(p_game_pk text,p_resource text,p_start timestamptz,p_observed_at timestamptz,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; existing public.mlb_pregame_research%rowtype; field text; identity text; prior_row jsonb;
begin
  if p_resource is null or p_resource !~ '^(board:v1|pitchlog:\d+|pitcher-window:\d+:([1-9]|10))$' or p_game_pk is null or p_game_pk !~ '^\d+$' or p_start is null or not isfinite(p_start)
    or p_observed_at is null or not isfinite(p_observed_at) or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>8388608 then raise exception 'Invalid MLB research snapshot'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mlb-research:'||p_game_pk,0));
  cutoff := public.mlb_research_start(p_game_pk,p_start);
  insert into public.mlb_research_clock(game_pk,start_at) values(p_game_pk,cutoff)
    on conflict(game_pk) do update set start_at=least(public.mlb_research_clock.start_at,excluded.start_at);
  select * into existing from public.mlb_pregame_research where game_pk=p_game_pk and resource=p_resource;
  if clock_timestamp()>=cutoff or p_observed_at>=cutoff or p_observed_at>clock_timestamp()
    or (existing.observed_at is not null and p_observed_at<=existing.observed_at)
    or (p_resource='board:v1' and (coalesce(jsonb_array_length(p_payload->'homeLineup'),0)=0 or coalesce(jsonb_array_length(p_payload->'awayLineup'),0)=0
    or p_payload->'homePitcher' is null or p_payload->'homePitcher'='null'::jsonb
    or p_payload->'awayPitcher' is null or p_payload->'awayPitcher'='null'::jsonb))
    or (p_resource like 'pitchlog:%' and jsonb_typeof(p_payload->'rows') is distinct from 'array') then
    return public.read_mlb_pregame_research(p_game_pk,p_resource,cutoff);
  end if;
  -- A transient provider failure must not replace a healthy whole-game bundle.
  if p_resource='board:v1' and existing.payload is not null then
    if (existing.payload->>'homeLineupConfirmed'='true' and p_payload->>'homeLineupConfirmed' is distinct from 'true')
      or (existing.payload->>'awayLineupConfirmed'='true' and p_payload->>'awayLineupConfirmed' is distinct from 'true')
      or (existing.payload->>'researchComplete'='true' and p_payload->>'researchComplete' is distinct from 'true')
      or not public.mlb_research_keeps_fields(existing.payload->'noHrCurrent',p_payload->'noHrCurrent')
      or not public.mlb_research_keeps_fields(existing.payload->'noHrOpen',p_payload->'noHrOpen') then
      return public.read_mlb_pregame_research(p_game_pk,p_resource,cutoff);
    end if;
    foreach field in array array['pitcherSplits','statSplits','timingSplits','openingSaRbi'] loop
      for prior_row in select value from jsonb_array_elements(coalesce(existing.payload->field,'[]'::jsonb)) loop
        if (prior_row->>'mlb_id' in (p_payload->'homePitcher'->>'id',p_payload->'awayPitcher'->>'id')
          or exists(select 1 from jsonb_array_elements((p_payload->'homeLineup')||(p_payload->'awayLineup')) player
            where (player->>'mlb_id'=prior_row->>'mlb_id') or (player->>'name_norm'=prior_row->>'name_norm')))
          and not public.mlb_research_keeps_fields(jsonb_build_array(prior_row),coalesce(p_payload->field,'[]'::jsonb)) then
          return public.read_mlb_pregame_research(p_game_pk,p_resource,cutoff);
        end if;
      end loop;
    end loop;
    foreach field in array array['precomputedStatcastByBatter','precomputedPitchlogByBatter','matchupEdgeByBatter','matchupEdgeByPitcher','mechanicsByPlayer','bdlByMlbId','bdlByName','pikkitByName','fhrAvgMap','saAvgMap'] loop
      for identity in select jsonb_object_keys(coalesce(existing.payload->field,'{}'::jsonb)) loop
        -- Removed lineup players are no longer in this comparison pool. Check
        -- nested hand/window/quote coverage only for still-rostered identities.
        if (identity in (p_payload->'homePitcher'->>'id',p_payload->'awayPitcher'->>'id',p_payload->'homePitcher'->>'name_norm',p_payload->'awayPitcher'->>'name_norm')
          or exists(select 1 from jsonb_array_elements((p_payload->'homeLineup')||(p_payload->'awayLineup')) player
             where player->>'mlb_id'=identity or player->>'name_norm'=identity))
          and not public.mlb_research_keeps_fields(existing.payload->field->identity,p_payload->field->identity) then
          return public.read_mlb_pregame_research(p_game_pk,p_resource,cutoff);
        end if;
      end loop;
    end loop;
  end if;
  if p_resource like 'pitchlog:%' and existing.payload is not null and jsonb_array_length(coalesce(p_payload->'rows','[]'::jsonb)) < jsonb_array_length(coalesce(existing.payload->'rows','[]'::jsonb)) then return public.read_mlb_pregame_research(p_game_pk,p_resource,cutoff); end if;
  if clock_timestamp()>=cutoff then return public.read_mlb_pregame_research(p_game_pk,p_resource,cutoff); end if;
  insert into public.mlb_pregame_research(game_pk,resource,start_at,observed_at,payload)
    values(p_game_pk,p_resource,cutoff,p_observed_at,p_payload)
    on conflict(game_pk,resource) do update set start_at=excluded.start_at,observed_at=excluded.observed_at,
      stored_at=clock_timestamp(),payload=excluded.payload,source='capture',source_key=null;
  return public.read_mlb_pregame_research(p_game_pk,p_resource,cutoff);
end $$;
revoke all on function public.capture_mlb_pregame_research(text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.capture_mlb_pregame_research(text,text,timestamptz,timestamptz,jsonb) to service_role;
