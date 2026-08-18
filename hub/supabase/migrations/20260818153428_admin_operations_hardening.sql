create table if not exists public.contact_recap_export_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  recap_date date not null,
  kind text not null check (kind in ('hr', 'near')),
  format text not null check (format in ('mp4', 'gif')),
  aspect text not null check (aspect in ('landscape', 'square', 'vertical')),
  status text not null default 'queued' check (status in ('queued', 'running', 'retrying', 'completed', 'failed', 'expired')),
  progress smallint not null default 0 check (progress between 0 and 100),
  stage text not null default 'Queued',
  workflow_run_id text,
  storage_path text,
  filename text,
  content_type text,
  byte_size bigint,
  attempt_count integer not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_recap_export_jobs_created_idx
  on public.contact_recap_export_jobs (created_at desc);
create index if not exists contact_recap_export_jobs_status_idx
  on public.contact_recap_export_jobs (status, updated_at desc);
create index if not exists contact_recap_export_jobs_expiry_idx
  on public.contact_recap_export_jobs (expires_at)
  where status = 'completed';

alter table public.contact_recap_export_jobs enable row level security;
revoke all on public.contact_recap_export_jobs from anon, authenticated;
grant all on public.contact_recap_export_jobs to service_role;

create table if not exists public.operational_retry_queue (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('discord', 'pikkit', 'whop')),
  operation text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  response_status integer,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists operational_retry_queue_active_dedupe_idx
  on public.operational_retry_queue (dedupe_key)
  where dedupe_key is not null and status in ('pending', 'processing');
create index if not exists operational_retry_queue_due_idx
  on public.operational_retry_queue (status, next_attempt_at);

alter table public.operational_retry_queue enable row level security;
revoke all on public.operational_retry_queue from anon, authenticated;
grant all on public.operational_retry_queue to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-recap-exports',
  'contact-recap-exports',
  false,
  314572800,
  array['video/mp4', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
