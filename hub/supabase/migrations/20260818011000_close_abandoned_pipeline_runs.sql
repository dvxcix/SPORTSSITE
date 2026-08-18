-- Runs left open by serverless termination are failures, not live work.
update public.pipeline_runs
set status = 'failed',
    finished_at = now(),
    error = coalesce(error, 'Execution ended without a completion signal (timeout or termination)'),
    details = details || jsonb_build_object('recovered_at', now())
where status = 'running'
  and started_at < now() - interval '15 minutes';

