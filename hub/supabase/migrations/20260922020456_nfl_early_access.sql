-- NFL entitlement only: never changes account_type, tier or beta_access_active.
create table if not exists public.nfl_early_access (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted_by uuid references public.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.nfl_early_access enable row level security;
revoke all on public.nfl_early_access from public, anon, authenticated;
grant select on public.nfl_early_access to authenticated;
grant all on public.nfl_early_access to service_role;
drop policy if exists "Members can read their own NFL grant" on public.nfl_early_access;
create policy "Members can read their own NFL grant"
  on public.nfl_early_access for select to authenticated
  using ((select auth.uid()) = user_id);
-- All mutations go through the admin-only API; no client write policy.
create index if not exists nfl_early_access_granted_by_idx on public.nfl_early_access(granted_by);
