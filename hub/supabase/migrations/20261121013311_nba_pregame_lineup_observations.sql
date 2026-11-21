-- Original pregame-source records, separate from research captured by us.
-- A late retrieval keeps the provider's pre-tip timestamp and is never a
-- replayed/new pregame capture. Existing freeze RPCs are not changed.
create table public.nba_pregame_lineup_observations (
  game_id bigint not null check (game_id > 0),
  team_id bigint not null check (team_id > 0),
  source_id bigint not null check (source_id > 0),
  source_updated_at timestamptz not null,
  cutoff_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  record_kind text generated always as (case when recorded_at < cutoff_at then 'captured-before-tip' else 'retrieved-pregame-snapshot' end) stored,
  status text not null check (status in ('expected','confirmed')),
  payload jsonb not null,
  primary key (game_id,team_id,source_updated_at),
  check (source_updated_at < cutoff_at and source_updated_at <= recorded_at),
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 32768)
);
alter table public.nba_pregame_lineup_observations enable row level security;
revoke all on table public.nba_pregame_lineup_observations from public, anon, authenticated, service_role;
grant select, insert on table public.nba_pregame_lineup_observations to service_role;
comment on table public.nba_pregame_lineup_observations is 'Immutable original pre-tip projected/confirmed lineup observations. Late source retrievals retain original observation time and explicit retrieval provenance. No direct member access.';
