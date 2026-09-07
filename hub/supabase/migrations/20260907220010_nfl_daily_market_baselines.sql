create table if not exists public.nfl_player_market_daily (
  slate_date date not null,
  game_id text not null,
  bdl_game_id bigint not null,
  season integer not null,
  week integer not null,
  game_type text,
  away_abbr text not null,
  home_abbr text not null,
  player_id bigint not null,
  player_name text not null,
  team_abbr text,
  position text,
  vendor text not null,
  prop_type text not null,
  market_key text not null,
  line_value numeric,
  market_type text not null,
  opening_line numeric,
  opening_odds integer,
  opening_over_odds integer,
  opening_under_odds integer,
  current_odds integer,
  current_over_odds integer,
  current_under_odds integer,
  source text not null default 'live',
  first_captured_at timestamptz not null default now(),
  last_captured_at timestamptz not null default now(),
  primary key (slate_date, game_id, player_id, vendor, market_key)
);

create index if not exists nfl_player_market_daily_player_prop_idx
  on public.nfl_player_market_daily (player_id, prop_type, vendor, slate_date desc);
create index if not exists nfl_player_market_daily_game_idx
  on public.nfl_player_market_daily (game_id, slate_date);
create index if not exists nfl_player_market_daily_slate_prop_idx
  on public.nfl_player_market_daily (slate_date, prop_type, vendor);

create table if not exists public.nfl_td_baseline_daily (
  slate_date date not null,
  player_id bigint not null,
  player_name text not null,
  team_abbr text,
  vendor text not null,
  prop_type text not null check (prop_type in ('anytime_td', 'first_td')),
  average_odds numeric not null,
  sample_games integer not null,
  first_sample_date date,
  through_date date,
  computed_at timestamptz not null default now(),
  primary key (slate_date, player_id, vendor, prop_type)
);

create index if not exists nfl_td_baseline_daily_slate_idx
  on public.nfl_td_baseline_daily (slate_date, prop_type, vendor);

create table if not exists public.nfl_odds_backfill_status (
  game_id text primary key,
  bdl_game_id bigint,
  status text not null check (status in ('complete', 'no-data', 'failed')),
  attempts integer not null default 1,
  last_error text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.ingest_nfl_market_daily(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
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
    x.current_odds, x.current_over_odds, x.current_under_odds,
    coalesce(x.source, 'live'), coalesce(x.captured_at, now()), coalesce(x.captured_at, now())
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
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
  on conflict (slate_date, game_id, player_id, vendor, market_key) do update set
    player_name = excluded.player_name,
    team_abbr = coalesce(excluded.team_abbr, nfl_player_market_daily.team_abbr),
    position = coalesce(excluded.position, nfl_player_market_daily.position),
    opening_line = coalesce(nfl_player_market_daily.opening_line, excluded.opening_line),
    opening_odds = coalesce(nfl_player_market_daily.opening_odds, excluded.opening_odds),
    opening_over_odds = coalesce(nfl_player_market_daily.opening_over_odds, excluded.opening_over_odds),
    opening_under_odds = coalesce(nfl_player_market_daily.opening_under_odds, excluded.opening_under_odds),
    current_odds = coalesce(excluded.current_odds, nfl_player_market_daily.current_odds),
    current_over_odds = coalesce(excluded.current_over_odds, nfl_player_market_daily.current_over_odds),
    current_under_odds = coalesce(excluded.current_under_odds, nfl_player_market_daily.current_under_odds),
    source = case when excluded.source = 'live' then 'live' else nfl_player_market_daily.source end,
    last_captured_at = greatest(nfl_player_market_daily.last_captured_at, excluded.last_captured_at);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.refresh_nfl_td_baselines(p_dates date[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.nfl_td_baseline_daily where slate_date = any(p_dates);

  insert into public.nfl_td_baseline_daily (
    slate_date, player_id, player_name, team_abbr, vendor, prop_type,
    average_odds, sample_games, first_sample_date, through_date, computed_at
  )
  with targets as (
    select distinct slate_date, player_id, player_name, team_abbr, vendor, prop_type
    from public.nfl_player_market_daily
    where slate_date = any(p_dates)
      and prop_type in ('anytime_td', 'first_td')
  )
  select
    target.slate_date,
    target.player_id,
    target.player_name,
    target.team_abbr,
    target.vendor,
    target.prop_type,
    avg(history.odds),
    count(*)::integer,
    min(history.slate_date),
    max(history.slate_date),
    now()
  from targets target
  cross join lateral (
    select
      prior.slate_date,
      coalesce(prior.opening_odds, prior.current_odds)::numeric as odds
    from public.nfl_player_market_daily prior
    where prior.player_id = target.player_id
      and prior.vendor = target.vendor
      and prior.prop_type = target.prop_type
      and prior.market_type = 'milestone'
      and prior.slate_date < target.slate_date
      and coalesce(prior.opening_odds, prior.current_odds) is not null
    order by prior.slate_date desc
    limit 20
  ) history
  group by target.slate_date, target.player_id, target.player_name,
    target.team_abbr, target.vendor, target.prop_type;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on table public.nfl_player_market_daily is
  'Canonical server-only daily NFL player-prop archive. Opening values are immutable after first capture; latest values track the final pregame market.';
comment on table public.nfl_td_baseline_daily is
  'Player-specific ATD and FTD reference prices frozen for each slate date using up to 20 prior market dates.';
comment on table public.nfl_odds_backfill_status is
  'Tracks completed historical BALLDONTLIE opening-market backfill work so cron runs remain bounded.';

alter table public.nfl_player_market_daily enable row level security;
alter table public.nfl_td_baseline_daily enable row level security;
alter table public.nfl_odds_backfill_status enable row level security;

revoke all on table public.nfl_player_market_daily from anon, authenticated;
revoke all on table public.nfl_td_baseline_daily from anon, authenticated;
revoke all on table public.nfl_odds_backfill_status from anon, authenticated;
revoke execute on function public.ingest_nfl_market_daily(jsonb) from public, anon, authenticated;
revoke execute on function public.refresh_nfl_td_baselines(date[]) from public, anon, authenticated;
grant execute on function public.ingest_nfl_market_daily(jsonb) to service_role;
grant execute on function public.refresh_nfl_td_baselines(date[]) to service_role;
