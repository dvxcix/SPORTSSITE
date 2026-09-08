create table if not exists public.nfl_matrices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#a7ff3f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  priority integer not null default 0,
  enabled boolean not null default true,
  matrix_type text not null default 'classic' check (matrix_type in ('classic', 'pipeline')),
  match_mode text not null default 'all' check (match_mode in ('all', 'any')),
  match_any_count integer,
  pipeline_scope text check (pipeline_scope in ('team', 'game')),
  definition jsonb not null default '{"factors":[]}'::jsonb,
  element_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nfl_matrices_user_priority_idx
  on public.nfl_matrices (user_id, priority, created_at);

create table if not exists public.nfl_matrix_marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  source_matrix_id uuid references public.nfl_matrices(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  tags text[] not null default '{}',
  matrix_type text not null check (matrix_type in ('classic', 'pipeline')),
  color text not null default '#a7ff3f',
  snapshot jsonb not null,
  status text not null default 'published' check (status in ('published', 'hidden')),
  copy_count integer not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, source_matrix_id)
);

create index if not exists nfl_matrix_marketplace_published_idx
  on public.nfl_matrix_marketplace_listings (status, published_at desc);

create table if not exists public.nfl_matrix_marketplace_imports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.nfl_matrix_marketplace_listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  imported_matrix_id uuid references public.nfl_matrices(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (listing_id, user_id)
);

alter table public.nfl_matrices enable row level security;
alter table public.nfl_matrix_marketplace_listings enable row level security;
alter table public.nfl_matrix_marketplace_imports enable row level security;

revoke all on table public.nfl_matrices from anon, authenticated;
revoke all on table public.nfl_matrix_marketplace_listings from anon, authenticated;
revoke all on table public.nfl_matrix_marketplace_imports from anon, authenticated;

comment on table public.nfl_matrices is
  'NFL-only user matrix definitions. Deliberately isolated from MLB matrices.';
comment on column public.nfl_matrices.definition is
  'Validated NFL classic factors or ordered pipeline steps; never evaluated as an MLB matrix.';

create or replace function public.increment_nfl_matrix_copy_count(listing_uuid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.nfl_matrix_marketplace_listings
  set copy_count = copy_count + 1
  where id = listing_uuid and status = 'published';
$$;

revoke all on function public.increment_nfl_matrix_copy_count(uuid) from public, anon, authenticated;
