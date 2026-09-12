create table if not exists public.research_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 64),
  sport text null check (sport is null or sport in ('MLB', 'NFL', 'MULTI')),
  watchlist_item_ids uuid[] not null default '{}',
  mlb_matrix_ids uuid[] not null default '{}',
  nfl_matrix_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.research_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null default '' check (char_length(body) <= 10000),
  sport text null check (sport is null or sport in ('MLB', 'NFL')),
  game_id text null check (game_id is null or char_length(game_id) <= 120),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_workspaces_user_recent_idx
  on public.research_workspaces (user_id, updated_at desc);
create index if not exists research_notes_user_pinned_recent_idx
  on public.research_notes (user_id, pinned desc, updated_at desc);

alter table public.research_workspaces enable row level security;
alter table public.research_notes enable row level security;

create policy "Members read own research workspaces"
  on public.research_workspaces for select using (user_id = (select auth.uid()));
create policy "Members create own research workspaces"
  on public.research_workspaces for insert with check (user_id = (select auth.uid()));
create policy "Members update own research workspaces"
  on public.research_workspaces for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members delete own research workspaces"
  on public.research_workspaces for delete using (user_id = (select auth.uid()));

create policy "Members read own research notes"
  on public.research_notes for select using (user_id = (select auth.uid()));
create policy "Members create own research notes"
  on public.research_notes for insert with check (user_id = (select auth.uid()));
create policy "Members update own research notes"
  on public.research_notes for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members delete own research notes"
  on public.research_notes for delete using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.research_workspaces to authenticated;
grant select, insert, update, delete on public.research_notes to authenticated;

create or replace function public.set_research_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_research_workspaces_updated_at on public.research_workspaces;
create trigger set_research_workspaces_updated_at before update on public.research_workspaces
for each row execute function public.set_research_updated_at();

drop trigger if exists set_research_notes_updated_at on public.research_notes;
create trigger set_research_notes_updated_at before update on public.research_notes
for each row execute function public.set_research_updated_at();
