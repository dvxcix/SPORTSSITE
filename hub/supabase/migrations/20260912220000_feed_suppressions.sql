create table if not exists public.feed_suppressions (
  user_id uuid not null references public.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'author')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index if not exists feed_suppressions_target_idx on public.feed_suppressions(target_type, target_id);
alter table public.feed_suppressions enable row level security;
create policy "Members view own feed suppressions" on public.feed_suppressions for select using (user_id = (select auth.uid()));
create policy "Members create own feed suppressions" on public.feed_suppressions for insert with check (user_id = (select auth.uid()));
create policy "Members remove own feed suppressions" on public.feed_suppressions for delete using (user_id = (select auth.uid()));
grant select, insert, delete on public.feed_suppressions to authenticated;
