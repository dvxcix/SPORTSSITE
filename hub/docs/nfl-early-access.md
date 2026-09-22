# NFL-only early access

Admin navigation: **People & community → NFL early access** (`/admin/nfl-access`).

- Search by @username or display name, then grant access.
- Approved testers can use all Sideline modes, Slate Edge, history, touchdown replays, and their own NFL Matrices.
- Revoke from the approved list. Subsequent server requests are denied; active web/desktop navigation and the mounted Sideline recheck every 30 seconds and on focus.
- This never modifies account_type, subscription tier, general beta access, or MLB permissions.
- Admins retain access independently of the tester list. Testers cannot access admin pages or admin APIs.
- Previously downloaded data cannot be recalled. Existing publicly available NFL player/team profile and social/composer surfaces are unchanged.

## Security

`nfl_early_access` is a separate RLS-protected table. Signed-in users can only read their own row, and cannot insert, update or delete grants. Anonymous users have no table privileges.

The admin endpoint authenticates the caller, checks the actual database admin role and MFA assurance, validates input, and records grants/revocations in the existing admin audit log. NFL checks are not cached in JWTs or persisted client profiles.

## Verification

- `npx tsx --test scripts/nfl-access.test.mts`: real gate/admin handler tests with isolated auth/database fixtures; anonymous, ordinary, tester, admin, MFA, invalid body/origin, database failure, grant and immediate revoke paths.
- `npm run typecheck`, targeted ESLint, and `npm run build` passed.
- Database transaction test passed: own row visible; another member's row hidden; client insert/update/delete denied; revocation immediately changes visibility; anonymous read denied. Entire fixture transaction was rolled back. No testers were enrolled.
- Supabase security advisors report no finding on the new table. Pre-existing unrelated findings were not modified.
- Local component fixture: after building, run `npx tsx scripts/nfl-access-ui-fixture.mts`, then open `http://127.0.0.1:4186`. All data and mutations in that fixture are mocked.
- Interactive browser verification is not completed: standalone browser launch and in-app browser were blocked by this machine's browser/sandbox errors.

## Rollout status

The empty database table and its policies are applied. The migration is idempotent for later migration-history reconciliation. Application changes still require deployment; no customer has been granted access automatically.
