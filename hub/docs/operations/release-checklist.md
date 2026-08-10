# Release checklist

## Before merge

- Rebase on the latest `main` without discarding unrelated work.
- Review the diff for secrets, private user columns, unsafe service-role usage, and unbounded queries.
- Run typecheck, production smoke tests, lint on changed files, and a production build.
- Test authentication, MFA enrollment/challenge, billing checkout, creator access, notifications, messages, and mobile navigation.
- Apply database migrations before code that depends on new tables or columns.
- Run Supabase security and performance advisors.

## Deploy

- Merge to `main` and watch the Vercel production deployment.
- Confirm `/api/health` returns HTTP 200.
- Confirm the newest release SHA appears in the health response.
- Review `/admin/pipeline-health` after the first scheduled cycle.
- Perform one low-risk notification and one test checkout/webhook event.

## Rollback

- Roll back the Vercel deployment first when application code is unhealthy.
- Do not reverse a database migration blindly. Prefer a forward-compatible corrective migration.
- Keep additive tables and columns during rollback unless they actively cause the incident.
- Record the incident, affected release SHA, timeline, and corrective action.
