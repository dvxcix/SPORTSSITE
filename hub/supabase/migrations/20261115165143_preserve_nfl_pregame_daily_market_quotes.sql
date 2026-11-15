-- Historical opening imports can fill opening fields without rewriting observed
-- pregame quotes or their timestamps. Only pregame observations enter live rows.
set local lock_timeout='3s';
do $guard$
begin
  if md5(pg_get_functiondef('public.ingest_nfl_market_daily(jsonb)'::regprocedure)) is distinct from 'fc7dce3de8dcfa1945db4f841257c6bf'
  then raise exception 'Unexpected NFL daily market ingest function'; end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.ingest_nfl_market_daily(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
begin
  with incoming as materialized (
    select x.* from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    slate_date date,
    game_id text,
    bdl_game_id bigint,
    season integer,
    week integer,
    game_type text,
    away_abbr text,
    home_abbr text,
    player_id bigint,
    player_name text,
    team_abbr text,
    position text,
    vendor text,
    prop_type text,
    market_key text,
    line_value numeric,
    market_type text,
    opening_line numeric,
    opening_odds integer,
    opening_over_odds integer,
    opening_under_odds integer,
    current_odds integer,
    current_over_odds integer,
    current_under_odds integer,
    source text,
    captured_at timestamptz
  )
  ), cutoffs as materialized (
    select game_id, public.nfl_research_kickoff(game_id,null) kickoff
    from (select distinct game_id from incoming) games
  )
  insert into public.nfl_player_market_daily (
    slate_date, game_id, bdl_game_id, season, week, game_type,
    away_abbr, home_abbr, player_id, player_name, team_abbr, position,
    vendor, prop_type, market_key, line_value, market_type, opening_line,
    opening_odds, opening_over_odds, opening_under_odds,
    current_odds, current_over_odds, current_under_odds,
    source, first_captured_at, last_captured_at
  )
  select
    x.slate_date, x.game_id, x.bdl_game_id, x.season, x.week, x.game_type,
    x.away_abbr, x.home_abbr, x.player_id, x.player_name, x.team_abbr, x.position,
    x.vendor, x.prop_type, x.market_key, x.line_value, x.market_type, x.opening_line,
    x.opening_odds, x.opening_over_odds, x.opening_under_odds,
    case when x.source is distinct from 'opening-backfill' then x.current_odds end,
    case when x.source is distinct from 'opening-backfill' then x.current_over_odds end,
    case when x.source is distinct from 'opening-backfill' then x.current_under_odds end,
    coalesce(x.source, 'live'), coalesce(x.captured_at, now()), coalesce(x.captured_at, now())
  from incoming x join cutoffs c on c.game_id=x.game_id
  where x.source='opening-backfill' or (
    x.captured_at is not null and x.captured_at<c.kickoff and x.captured_at<=clock_timestamp()
  )
  on conflict (slate_date, game_id, player_id, vendor, market_key) do update set
    player_name = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.player_name else excluded.player_name end,
    team_abbr = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.team_abbr else coalesce(excluded.team_abbr, nfl_player_market_daily.team_abbr) end,
    position = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.position else coalesce(excluded.position, nfl_player_market_daily.position) end,
    opening_line = coalesce(nfl_player_market_daily.opening_line, excluded.opening_line),
    opening_odds = coalesce(nfl_player_market_daily.opening_odds, excluded.opening_odds),
    opening_over_odds = coalesce(nfl_player_market_daily.opening_over_odds, excluded.opening_over_odds),
    opening_under_odds = coalesce(nfl_player_market_daily.opening_under_odds, excluded.opening_under_odds),
    current_odds = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.current_odds else coalesce(excluded.current_odds, nfl_player_market_daily.current_odds) end,
    current_over_odds = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.current_over_odds else coalesce(excluded.current_over_odds, nfl_player_market_daily.current_over_odds) end,
    current_under_odds = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.current_under_odds else coalesce(excluded.current_under_odds, nfl_player_market_daily.current_under_odds) end,
    source = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.source else case when excluded.source = 'live' then 'live' else nfl_player_market_daily.source end end,
    last_captured_at = case
      when excluded.source='opening-backfill' or excluded.last_captured_at<nfl_player_market_daily.last_captured_at
      then nfl_player_market_daily.last_captured_at else greatest(nfl_player_market_daily.last_captured_at, excluded.last_captured_at) end;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;
