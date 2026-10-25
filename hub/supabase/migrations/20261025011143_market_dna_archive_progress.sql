-- Individually reviewed repair. Do not replay historical migrations.
-- No archive rows or model artifacts are rewritten.
create table public.market_dna_archive_progress (
  game_date date not null,
  source_version text not null,
  status text not null check (status in ('no_games', 'complete', 'incomplete')),
  scheduled_game_ids bigint[] not null default '{}',
  archived_game_ids bigint[] not null default '{}',
  player_count integer not null default 0 check (player_count >= 0),
  observed_at timestamptz not null default now(),
  primary key (game_date, source_version),
  check (status <> 'no_games' or (
    cardinality(scheduled_game_ids) = 0 and cardinality(archived_game_ids) = 0 and player_count = 0
  )),
  check (status <> 'complete' or (
    cardinality(scheduled_game_ids) > 0
    and scheduled_game_ids @> archived_game_ids
    and archived_game_ids @> scheduled_game_ids
    and cardinality(scheduled_game_ids) = cardinality(archived_game_ids)
    and player_count >= 18 * cardinality(scheduled_game_ids)
  ))
);
alter table public.market_dna_archive_progress enable row level security;
revoke all on public.market_dna_archive_progress from public, anon, authenticated, service_role;
grant select, insert, update on public.market_dna_archive_progress to service_role;
comment on table public.market_dna_archive_progress is
  'Private verified schedule/archive progress. Empty dates advance; incomplete dates remain retryable. No synthetic training rows.';
