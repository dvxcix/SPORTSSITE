create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  query text not null check (char_length(btrim(query)) between 1 and 64),
  query_key text not null check (char_length(query_key) between 1 and 64),
  result_tab text not null default 'all' check (result_tab in ('all', 'users', 'posts', 'picks', 'community', 'mlb', 'nfl')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, query_key, result_tab)
);

create index if not exists saved_searches_user_recent_idx
  on public.saved_searches (user_id, last_used_at desc);

alter table public.saved_searches enable row level security;

create policy "Members read own saved searches"
  on public.saved_searches for select
  using (user_id = (select auth.uid()));
create policy "Members save own searches"
  on public.saved_searches for insert
  with check (user_id = (select auth.uid()));
create policy "Members update own saved searches"
  on public.saved_searches for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Members delete own saved searches"
  on public.saved_searches for delete
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.saved_searches to authenticated;
