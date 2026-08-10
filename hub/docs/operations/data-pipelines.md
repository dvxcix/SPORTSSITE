# Data pipeline recovery

Every Vercel cron route writes a `pipeline_runs` result and appears in `/admin/pipeline-health`.

## Stale or failed job

1. Confirm its schedule and last successful run.
2. Inspect the recorded HTTP status/error, then Vercel function and Supabase logs.
3. Check upstream provider availability and credentials.
4. Re-run the exact cron route with the configured cron authorization.
5. Verify the new run succeeded and validate the downstream cache/table timestamp.

Do not repeatedly replay a write-heavy import without checking whether it is idempotent. Odds and confirmed historical data must remain frozen at the product-defined game-start boundary.
