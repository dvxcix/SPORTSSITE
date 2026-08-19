alter table public.pipeline_runs
  drop constraint if exists pipeline_runs_status_check;

alter table public.pipeline_runs
  add constraint pipeline_runs_status_check
  check (status in ('running', 'succeeded', 'failed', 'deferred'));
