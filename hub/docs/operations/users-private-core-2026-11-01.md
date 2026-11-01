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

Primary migrations `20261101083502_visible_pick_records_projection` and
`20261101083511_public_leaderboard_eligibility` correspond to tracked CLI
sources `20261101083001_visible_pick_records_projection.sql` and
`20261101083427_public_leaderboard_eligibility.sql`. They add a bounded
viewer-aware record projection and a service-only fresh leaderboard eligibility
check. Both passed rolled-back role fixtures and independent review. Installing
the functions alone does not restrict the existing raw `pick_record` grant;
the compatible application and a separately reviewed revoke are required.
Do not replay these migrations.

Primary migration `20261101083928_changelog_private_access` applies CLI source
`20261101083903_changelog_private_access.sql`. Its no-argument, caller-bound
private helper preserves the prior changelog audience policy without requiring
API users to read another account's grant field. Synthetic rollback fixtures
covered standard, Ultimate, admin, anonymous and service cases; production
checks confirmed the postgres owner, fixed search path and function grants.
Do not replay this migration.

This is only the first containment step. User preferences, mixed favorites,
grant entitlements, other tables and API/RPC paths need further review and
protection. Public profile links intentionally shared by members may still
include a provider identifier. No historical access or exposure conclusion
is implied. Test app, owner settings, direct API and other-sport behavior
before asserting end-to-end privacy or compatibility.
