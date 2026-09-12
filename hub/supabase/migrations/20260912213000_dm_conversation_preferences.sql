create table if not exists public.dm_conversation_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  partner_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('accepted', 'declined')),
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  check (user_id <> partner_id)
);

create index if not exists dm_conversation_preferences_partner_idx
  on public.dm_conversation_preferences(partner_id);

alter table public.dm_conversation_preferences enable row level security;
create policy "Members view own DM preferences" on public.dm_conversation_preferences for select using (user_id = (select auth.uid()));
create policy "Members create own DM preferences" on public.dm_conversation_preferences for insert with check (user_id = (select auth.uid()));
create policy "Members update own DM preferences" on public.dm_conversation_preferences for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members delete own DM preferences" on public.dm_conversation_preferences for delete using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.dm_conversation_preferences to authenticated;
