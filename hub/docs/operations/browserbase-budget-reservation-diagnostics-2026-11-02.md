# Browserbase budget reservation diagnostics

This is a read-only procedure for investigating a blocked shared Browserbase
reservation. It does not create a browser, change a budget, clear a reservation,
contact a provider, or authorize a replay. The shared guard migration may not
yet be applied; confirm the deployed source, migration state and project before
using this procedure. Keep its output private.

1. Inspect the unresolved rows through the authorized database SQL console or
   read-only database tool, using the primary SlipSurge project only. Replace
   the placeholder with the exact verified Browserbase project ID; do not use
   the service key in a browser or paste it into logs.

   ```sql
   select project_id, period_id, reservation_id, status, created_at,
          creating_at, remote_session_id, heartbeat_at, closed_at
   from public.browserbase_shared_budget_reservations
   where project_id = '<verified-browserbase-project-id>'
     and status <> 'closed'
   order by created_at;
   ```

   Record the query time and exact reservation ID. A `pending` row is a
   pre-create reservation. A `creating` row means a create request may have
   been attempted; do not assume a browser was or was not created. `active`
   and `closing` rows contain an exact remote session ID when available.

2. In the Browserbase dashboard, select the matching **production project**
   and inspect its sessions. If the reservation has a remote session ID, inspect
   that exact ID. If it does not, look for the exact `budgetReservation` value
   in session metadata and independently confirm the project ID and timestamps.
   Session listings can be incomplete, retained for limited periods, delayed,
   or scoped to a project. No match, an empty filtered list, or a 404 is not
   proof that a session never existed or stopped billing. Do not open a session
   or a live view to perform this inspection.

3. Record the returned session ID, project ID, status, start/end times and the
   matching reservation ID, if available. Do not record the API key, connection
   URL, debugger URL, browser cookies, or unrestricted metadata. A `PENDING` or
   `RUNNING` status is not evidence of completion. If a session has status
   `ERROR`, `TIMED_OUT`, or `COMPLETED`, retain that fact and any `endedAt` value
   as evidence, but do not automatically clear a reservation on that basis.
   Browserbase's [session API](https://docs.browserbase.com/reference/api/get-a-session)
   lists these statuses and `endedAt`; it does not specify that every terminal
   status or an `endedAt` value proves all billing and network activity stopped.
   The current app's ordinary close path specifically requires a confirmed
   `COMPLETED` response; it is not an independent invoice-level guarantee.

4. Preserve the unresolved row and its debit whenever identity or remote
   completion is uncertain. Recheck project usage and all account projects
   independently: the guard's project meter does not represent all activity on
   a shared Browserbase plan, and usage data may lag. The user-approved budget
   cannot be restored by changing the baseline or deleting reservations.

5. If exact remote completion is independently verified, document the evidence
   and obtain a separately reviewed, narrowly scoped recovery action before any
   database mutation. A `creating` row without an exact remote ID needs further
   investigation; a missing list entry is not sufficient. Do not use the
   pre-create abandonment function after a create POST may have been sent.
   Never release a shared Pikkit context lease just because an ambiguous
   Browserbase session appears absent.

The Browserbase [list sessions API](https://docs.browserbase.com/reference/api/list-sessions)
documents metadata and status fields but does not establish an exhaustive,
real-time billing ledger. The provider's [plans documentation](https://docs.browserbase.com/account/billing/plans)
states that overages have no built-in spending cutoff. Do not call an estimate
or a dashboard alert a guaranteed invoice cap.
