# Emergency email containment: 31 October 2026

The owner authorized an emergency restriction on direct reads of member email
addresses after anonymous access through the database API was confirmed. The
primary database applied `20261031162753_users_email_emergency_containment`;
the reviewed CLI source is `20261031162720_users_email_emergency_containment.sql`.
Do not replay it or the historical migration tree.

The migration revoked table-wide SELECT for the API roles and regranted their
previous access to each non-email column. It leaves service-role access, row
data, RLS and UPDATE grants intact. Live privilege checks confirmed that `anon`
and `authenticated` cannot select email, that `service_role` can, and that
both API roles can still select public usernames. A signed-in admin saved the
same privacy settings through the production UI: a pre/post digest matched and
the row version changed. Earlier staging role fixtures passed; no customer
email values were retrieved for verification.

This is containment, not a full privacy fix. Other private columns on
`public.users` remain readable to the API roles. A reviewed public-column
contract and authenticated owner-only access for sensitive data are still
needed. Column-restricted roles cannot use wildcard SELECT against this table;
older external clients or indirect queries using wildcard projections may fail.
The live anonymous and authenticated HTTP email-denial checks remain unverified.
Do not claim that prior exposure was never exploited or that all account data
is protected.

Existing MLB offseason restrictions and the 2027 checklist remain in effect.
Do not regrant table-wide SELECT when making later changes: doing so would
restore direct email exposure. Evaluate grant changes against the live schema
and compatibility before release.
