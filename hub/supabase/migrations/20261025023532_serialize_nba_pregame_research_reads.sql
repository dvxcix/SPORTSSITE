-- The first read after tip waits for any pre-tip writer's commit. A plain
-- SELECT could see the preceding row and cache it as immutable while that writer
-- is still committing. This read uses the capture function's per-game lock.
create function public.read_nba_pregame_research(
  p_game_id bigint, p_resource text, p_version integer, p_tipoff timestamptz
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  cutoff timestamptz;
  current_row public.nba_pregame_research%rowtype;
begin
  if p_game_id is null or p_game_id <= 0 or p_resource is null or p_resource !~ '^[a-zA-Z0-9:_-]{1,160}$'
    or p_version is null or p_version <> 1 or p_tipoff is null or not isfinite(p_tipoff) then
    raise exception 'Invalid pregame research read' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(81051, (p_game_id % 2147483647)::integer);
  cutoff := public.nba_phase_cutoff(p_game_id,p_tipoff);
  select * into current_row from public.nba_pregame_research
    where game_id=p_game_id and resource=p_resource and version=p_version;
  if current_row.observed_at is null or current_row.observed_at >= cutoff
    or current_row.observed_at > clock_timestamp() then return null; end if;
  return jsonb_build_object('payload',current_row.payload,'observed_at',current_row.observed_at,
    'tipoff_at',least(current_row.tipoff_at,cutoff),'source',current_row.source);
end;
$$;
revoke all on function public.read_nba_pregame_research(bigint,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.read_nba_pregame_research(bigint,text,integer,timestamptz) to service_role;
