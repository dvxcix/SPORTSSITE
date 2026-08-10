create table if not exists public.matrix_marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  source_matrix_id uuid references public.matrices(id) on delete set null,
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 600),
  tags text[] not null default '{}',
  matrix_type text not null check (matrix_type in ('classic', 'pipeline')),
  color text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  status text not null default 'published' check (status in ('published', 'unlisted', 'removed')),
  copy_count integer not null default 0 check (copy_count >= 0),
  moderation_note text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists matrix_marketplace_one_live_source_idx
  on public.matrix_marketplace_listings(author_id, source_matrix_id)
  where source_matrix_id is not null and status = 'published';

create index if not exists matrix_marketplace_discovery_idx
  on public.matrix_marketplace_listings(status, published_at desc);

create index if not exists matrix_marketplace_popular_idx
  on public.matrix_marketplace_listings(status, copy_count desc, published_at desc);

create index if not exists matrix_marketplace_author_idx
  on public.matrix_marketplace_listings(author_id, status, published_at desc);

create index if not exists matrix_marketplace_tags_idx
  on public.matrix_marketplace_listings using gin(tags);

create table if not exists public.matrix_marketplace_imports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.matrix_marketplace_listings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  imported_matrix_id uuid references public.matrices(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(imported_matrix_id)
);

create index if not exists matrix_marketplace_imports_listing_idx
  on public.matrix_marketplace_imports(listing_id, created_at desc);

create index if not exists matrix_marketplace_imports_user_idx
  on public.matrix_marketplace_imports(user_id, created_at desc);

create or replace function public.touch_matrix_marketplace_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matrix_marketplace_touch_updated_at on public.matrix_marketplace_listings;
create trigger matrix_marketplace_touch_updated_at
before update on public.matrix_marketplace_listings
for each row execute function public.touch_matrix_marketplace_listing();

create or replace function public.record_matrix_marketplace_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.matrix_marketplace_listings
  set copy_count = copy_count + 1
  where id = new.listing_id;
  return new;
end;
$$;

drop trigger if exists matrix_marketplace_count_copy on public.matrix_marketplace_imports;
create trigger matrix_marketplace_count_copy
after insert on public.matrix_marketplace_imports
for each row execute function public.record_matrix_marketplace_copy();

alter table public.matrix_marketplace_listings enable row level security;
alter table public.matrix_marketplace_imports enable row level security;

revoke all on table public.matrix_marketplace_listings from anon, authenticated;
revoke all on table public.matrix_marketplace_imports from anon, authenticated;
grant all on table public.matrix_marketplace_listings to service_role;
grant all on table public.matrix_marketplace_imports to service_role;

revoke all on function public.touch_matrix_marketplace_listing() from public, anon, authenticated;
revoke all on function public.record_matrix_marketplace_copy() from public, anon, authenticated;
grant execute on function public.touch_matrix_marketplace_listing() to service_role;
grant execute on function public.record_matrix_marketplace_copy() to service_role;
