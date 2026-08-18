create index if not exists contact_recap_export_jobs_created_by_idx
  on public.contact_recap_export_jobs (created_by, created_at desc);

drop policy if exists contact_recap_export_jobs_server_only on public.contact_recap_export_jobs;
create policy contact_recap_export_jobs_server_only
  on public.contact_recap_export_jobs
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists operational_retry_queue_server_only on public.operational_retry_queue;
create policy operational_retry_queue_server_only
  on public.operational_retry_queue
  for all
  to anon, authenticated
  using (false)
  with check (false);
