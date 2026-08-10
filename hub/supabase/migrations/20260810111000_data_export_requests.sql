-- Self-service, auditable account-data export queue.

create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'delivered', 'failed', 'canceled')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  delivery_email text,
  export_url text,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists data_export_one_open_request_idx
  on public.data_export_requests (user_id)
  where status in ('queued', 'processing', 'ready');
create index if not exists data_export_status_requested_idx
  on public.data_export_requests (status, requested_at asc);

alter table public.data_export_requests enable row level security;

drop policy if exists data_export_select_own on public.data_export_requests;
create policy data_export_select_own on public.data_export_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.data_export_requests from anon, authenticated;
grant select on table public.data_export_requests to authenticated;
grant all on table public.data_export_requests to service_role;

comment on table public.data_export_requests is
  'Server-created queue for portable user-data exports. Users can only read their own request status.';
