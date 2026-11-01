# User private account fields: initial containment

On 1 November 2026, the owner authorized the full privacy repair. Primary
database migration `20261101081331_users_private_core_containment` applied the
tracked source `20261101081305_users_private_core_containment.sql`. Do not
replay it or historical migrations.

The migration removes anonymous and authenticated SELECT on 21 account fields:
Stripe and Whop identifiers, billing and membership lifecycle metadata,
Discord account identifiers, creator commerce metadata, and internal grant
actor/time/notes. It preserves the earlier email restriction, all other column
grants, service access and existing row-level policies. Live metadata checks
confirmed zero readable protected fields for both API roles, all 21 still
available to the service role, email denied, and public username available.
Two rolled-back staging role fixtures and independent review passed.

Primary migration `20261101081611_creator_provider_id_containment` applies
tracked source `20261101081553_creator_provider_id_containment.sql`. It also
restricts creator entitlement Whop membership IDs and subscription Stripe
subscription IDs, retaining other reads, existing RLS, write grants and server
access. Those tables had no rows at the time of review. Do not replay it.

Primary migration `20261101082627_save_account_preferences_private` corresponds
to CLI source `20261101081737_save_account_preferences_private.sql`. It adds a
service-only invoker function for owner-bound, atomic preference saves; it does
not change stored settings or client grants. Never replay it. Rollback-only
staging fixtures verified expected-value conflicts, preservation of unknown and
malformed legacy values, and role restrictions; separate-session concurrency
and live gateway behavior require verification.

Primary migration `20261101083314_users_private_settings_read` applies tracked
source `20261101083254_users_private_settings_read.sql`, removing API-role
SELECT on notification and delivery settings, interests, Dugout columns,
onboarding-complete flag and profile updated timestamp while preserving UPDATE
and service access. The owner-scoped application was live before this change.
The owner's unchanged notification settings saved via the real application
before and after the restriction; their persisted digest stayed identical and
the row version advanced. Do not replay this migration.

This is only the first containment step. User preferences, mixed favorites,
grant entitlements, other tables and API/RPC paths need further review and
protection. Public profile links intentionally shared by members may still
include a provider identifier. No historical access or exposure conclusion
is implied. Test app, owner settings, direct API and other-sport behavior
before asserting end-to-end privacy or compatibility.
