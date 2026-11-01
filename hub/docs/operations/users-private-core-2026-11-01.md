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

This is only the first containment step. User preferences, mixed favorites,
grant entitlements, other tables and API/RPC paths need further review and
protection. Public profile links intentionally shared by members may still
include a provider identifier. No historical access or exposure conclusion
is implied. Test app, owner settings, direct API and other-sport behavior
before asserting end-to-end privacy or compatibility.
