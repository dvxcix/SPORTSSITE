create table if not exists public.market_dna_profile_archive (
  game_date date not null,
  game_pk bigint not null,
  game_key text not null,
  mlb_id bigint not null,
  player_name text not null,
  name_norm text not null,
  team_abbr text not null,
  opponent_abbr text not null,
  batting_order smallint not null check (batting_order between 1 and 9),
  profile jsonb not null,
  feature_vector jsonb not null,
  did_hr boolean not null default false,
  home_runs smallint not null default 0 check (home_runs >= 0),
  hits smallint not null default 0 check (hits >= 0),
  runs smallint not null default 0 check (runs >= 0),
  rbis smallint not null default 0 check (rbis >= 0),
  total_bases smallint not null default 0 check (total_bases >= 0),
  stolen_bases smallint not null default 0 check (stolen_bases >= 0),
  did_double boolean not null default false,
  did_triple boolean not null default false,
  first_hr boolean not null default false,
  hr_ml_won boolean not null default false,
  source_version text not null default 'canonical-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_pk, mlb_id)
);

create index if not exists market_dna_archive_date_game_idx
  on public.market_dna_profile_archive (game_date desc, game_pk);

create index if not exists market_dna_archive_player_date_idx
  on public.market_dna_profile_archive (name_norm, game_date desc);

create index if not exists market_dna_archive_hr_date_idx
  on public.market_dna_profile_archive (game_date desc)
  where did_hr;

alter table public.market_dna_profile_archive enable row level security;

revoke all on table public.market_dna_profile_archive from anon, authenticated;
grant all on table public.market_dna_profile_archive to service_role;

comment on table public.market_dna_profile_archive is
  'Server-only, outcome-blind pregame Market DNA profiles reconstructed from the same frozen inputs as TheDugout. Outcomes are attached after final grading.';
