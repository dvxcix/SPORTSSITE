create table if not exists public.market_dna_ranker_models (
  target_date date primary key,
  trained_through date not null,
  model_version text not null,
  training_rows integer not null check (training_rows > 0),
  validation jsonb,
  artifact jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.market_dna_ranker_models enable row level security;

revoke all on table public.market_dna_ranker_models from anon, authenticated;
grant all on table public.market_dna_ranker_models to service_role;

comment on table public.market_dna_ranker_models is
  'Server-only, date-versioned Market DNA game-relative models. Each artifact is trained exclusively on completed games before target_date.';
