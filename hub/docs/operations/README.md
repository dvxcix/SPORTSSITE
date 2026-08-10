# SlipSurge production operations

Use this directory during releases and incidents. The admin pipeline page is the first operational dashboard. The public `/api/health` endpoint is suitable for an uptime monitor.

## Routine checks

1. Confirm `/api/health` returns HTTP 200.
2. Review `/admin/pipeline-health` for stale jobs, delivery failures, failed webhooks, exports, reports, and creator applications.
3. Review `/admin/audit` for privileged changes.
4. Run `npm run typecheck`, `npm run test:production`, and `npm run build` before release.
5. Run Supabase security and performance advisors after every schema migration.

## Runbooks

- [Release checklist](release-checklist.md)
- [Incident response](incident-response.md)
- [Billing and webhook recovery](billing-webhooks.md)
- [Data pipeline recovery](data-pipelines.md)
- [Privacy and account deletion](privacy-requests.md)
