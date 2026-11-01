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
check. Both passed rolled-back role fixtures and independent review. The
compatible application was deployed before the separate restriction described
below. Do not replay these migrations.

Primary migration `20261101083928_changelog_private_access` applies CLI source
`20261101083903_changelog_private_access.sql`. Its no-argument, caller-bound
private helper preserves the prior changelog audience policy without requiring
API users to read another account's grant field. Synthetic rollback fixtures
covered standard, Ultimate, admin, anonymous and service cases; production
checks confirmed the postgres owner, fixed search path and function grants.
Do not replay this migration.

Primary migration `20261101084831_users_private_projection_read` corresponds
to CLI source `20261101084800_users_private_projection_read.sql`. Following
deployment of commit `0f5ec1ad`, it removed anonymous and authenticated raw
SELECT on pick records, connected identities, favorite and sport preference
arrays, and internal access grant flags. It preserves service reads and all
write privileges. Live role checks found zero readable protected columns for
either API role and eight for the service role. The signed-in owner's profile,
The Court and The Sideline loaded after the change. Do not replay it.

Primary migration `20261101084722_get_own_onboarding_complete` corresponds to
CLI source `20261101084500_get_own_onboarding_complete.sql`. It installs an
authenticated, caller-bound boolean helper before the compatible middleware
release. Primary migration `20261101085140_users_onboarding_member_private`
corresponds to `20261101085200_users_onboarding_member_private.sql` and removes
raw API-role SELECT on membership status and onboarding completion time. The
compatible application was live and signed-in Explore loaded before the
restriction; afterward the same signed-in page loaded normally and role checks
confirmed neither field is readable to either API role. Do not replay them.

Primary migration `20261101085710_channel_roster_privacy` corresponds to
`20261101085700_channel_roster_privacy.sql`. It limits channel roster reads to
the viewer's own membership or an authorized channel and group, preserving
public rosters and the MLB offseason restriction. A rolled-back synthetic
staging fixture covered guest, denied-role, authorized, MLB and recursion cases;
production has no membership rows, so populated production behavior remains
unverified. Existing access helpers trust retained membership after paid
entitlement expiry; this change does not establish billing enforcement.

Public profile links intentionally shared by members may still include a
provider identifier. No historical access or exploitation is implied. Legacy
clients that request every users column may need an update; owner-only data
continues through the verified server paths.
