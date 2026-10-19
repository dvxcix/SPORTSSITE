-- Quarter identity is request provenance, not game.period (which is the live/final clock).
create table public.nba_player_period_stats (
  period integer not null check(period between 1 and 4), id bigint not null,
  player_id bigint not null, game_id bigint not null references public.nba_games(id),
  team_id bigint not null, season integer not null, game_date date not null,
  postseason boolean not null default false, position text,
  payload jsonb not null, fetched_at timestamptz not null default now(),
  primary key(period,id), unique(player_id,game_id,period),
  check((payload->>'period')::integer=period)
);
create index nba_period_stats_game on public.nba_player_period_stats(game_id,period,player_id);
create index nba_period_stats_season on public.nba_player_period_stats(season,period,game_date);
create index nba_period_stats_player on public.nba_player_period_stats(player_id,period,game_date desc);
alter table public.nba_player_period_stats enable row level security;
revoke all on public.nba_player_period_stats from public,anon,authenticated;
grant select,insert,update on public.nba_player_period_stats to service_role;
