create table if not exists public.integration_reconcile_state (
  job_name text primary key,
  cursor text,
  updated_at timestamptz not null default now()
);

alter table public.integration_reconcile_state enable row level security;

comment on table public.integration_reconcile_state is
  'Service-role-only cursors for bounded external-provider reconciliation jobs.';
