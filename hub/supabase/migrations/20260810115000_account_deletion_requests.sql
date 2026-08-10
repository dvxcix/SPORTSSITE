-- Auditable account-deletion queue. Deletion itself remains an explicit,
-- privileged operation so active billing and creator payouts can be reviewed.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'scheduled', 'completed', 'canceled', 'blocked')),
  reason text,
  requested_at timestamptz not null default now(),
  canceled_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  scheduled_for timestamptz,
  completed_at timestamptz,
  resolution_note text
);

create unique index if not exists account_deletion_one_open_idx
  on public.account_deletion_requests (user_id)
  where status in ('pending', 'reviewing', 'scheduled', 'blocked');
create index if not exists account_deletion_status_requested_idx
  on public.account_deletion_requests (status, requested_at asc);

alter table public.account_deletion_requests enable row level security;
drop policy if exists account_deletion_select_own on public.account_deletion_requests;
create policy account_deletion_select_own on public.account_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

comment on table public.account_deletion_requests is
  'User-requested account deletion queue with billing-aware administrative review.';
