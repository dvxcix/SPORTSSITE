# Incident response

1. Declare the incident and record the start time, release SHA, affected surfaces, and user impact.
2. Check `/api/health`, Vercel logs, Supabase API/Auth/Postgres logs, and `/admin/pipeline-health`.
3. Stop further damage. Disable the affected feature, pause a job, or roll back the application release. Do not delete evidence.
4. Restore service using the smallest reversible change.
5. Validate authentication, billing, creator access, data freshness, and notification delivery.
6. Communicate a concise status to affected users if impact is material.
7. Complete a post-incident review with root cause, detection gap, corrective work, and owner.

Never paste service-role keys, webhook secrets, access tokens, payment data, or private user records into tickets or chat.
