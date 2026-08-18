create table if not exists public.research_mechanics_snapshots (
  game_date date not null,
  game_pk bigint not null,
  window_games smallint not null check (window_games in (1, 3, 5, 10)),
  model_version text not null,
  lineup_signature text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (game_date, game_pk, window_games, model_version)
);

create index if not exists research_mechanics_snapshots_recent_idx
  on public.research_mechanics_snapshots (game_date desc, computed_at desc);

alter table public.research_mechanics_snapshots enable row level security;
revoke all on table public.research_mechanics_snapshots from public, anon, authenticated;

comment on table public.research_mechanics_snapshots is
  'Server-only cached HR mechanics game payloads. Inputs are pregame-only and outputs are delivered through the Ultimate-gated Research API.';

