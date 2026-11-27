# SlipSurge iOS launch pipeline

The [November 27 checkpoint](2026-11-27-ios-field-research-community.md) records
NFL field diagrams, research chart changes and the two-account private community test.

November 26–27, 2026. Native work continues on `codex/ios-parity-20261125`
from build 9 source `691c4114` and handoff `a18dbe91`. The production Hub
baseline for this pass is `a36c38ec`.

## Release order

| Gate | Experience | Evidence required |
| --- | --- | --- |
| 1. Welcome and discovery | A new visitor can join free, sign in, browse the live product, see research previews and find creator tools without waiting for the intro to advance. Feed and Research have a clear path to Ultimate. | Walk each welcome action on a fresh iPhone install. Dismiss the Feed offer, reopen Research, and verify that returning Ultimate members see their account access without an upsell. Check Light, Dark, Color, Reduce Motion and a narrow iPad window. |
| 2. Membership and return | Show what Free includes, show Ultimate benefits at the point of need, and show actual account-specific prices, renewal terms and eligible offers at checkout. Return to the selected game and filters once entitlement is confirmed. | Run sign-in continuity, both Odds Boards and a purchase sandbox matrix. Cover eligible and ineligible storefronts, canceled and pending checkout, restore, renewal, existing Whop access and duplicate-payment prevention. |
| 3. Creator and member journeys | Start a free community, choose visibility, set up paid access, publish a members-only pick and connect Discord. Fans can find the creator, understand the offer, unlock the correct membership and claim roles. | Test separately with a new creator, an eligible paid creator and a second member. Verify visibility from signed-out, free, paid, canceled and expired accounts. Check Discord on a consenting test server, including role removal. |
| 4. Core product polish | Improve the highest-use flows through Feed, player research, Game Center, Community, Inbox and You using the same spacing, touch feedback and interruption behavior. | Compare the actual flows against HOF and Outlier for research, TheReal for games, and X and Discord for social. Time cold launch, first useful Feed content and the Odds Boards. Include ordinary, slow/offline and empty states, accessibility and compact/full-width layout. |
| 5. Turn a release candidate into a release | Complete the store listing, review access, support and moderation paths, distribution signing and release ownership. | Verify fresh install and upgrade from TestFlight on actual iPhone and iPad. Finish in-region subscription and restore checks, account deletion, reporting and blocking, and enriched notifications with a live game. Run through the App Review submission with a demo account and record rollback and support ownership. |

## First implementation

The welcome now shows a creator scene and has a direct Creator tools action.
The chooser leads to the existing free community form or paid storefront setup.
Free community creation and paid storefront setup both keep their destination
through authentication and account setup. Creator discovery remains accessible
through Community.

Guests and confirmed non-Ultimate members get a dismissible Feed entry.
The Court, The Sideline, and Research expose the offer where it applies.
The sheet uses a native presentation, an accessible close action and motion
that honors Reduce Motion. Research preview remains available from the locks.
The signed-in billing page uses server quotes and existing checkout rules.
The purchase button is available only where the app's existing storefront
policy permits it. The new native screens introduce no product ID, discount,
payment processor, or backend permission.

## Design and launch checks

- Apple Invites shows an upgrade at the intended action and returns there
  after the upgrade. Its dismiss and confirmation behavior informed the
  research gate. [Mobbin iOS flow](https://mobbin.com/flows/c661bfdf-a5eb-4cf5-9ffe-11f9613ebc57)
- Outlier connects plan differences to the actual research tasks users can
  perform. Including the full slate and sportsbook comparison makes the
  SlipSurge offer specific. [Outlier plan guide](https://help.outlier.bet/en/articles/12556823-choosing-the-right-outlier-plan-for-your-betting-style)
- Patreon distinguishes a paid membership from claiming a Discord role.
  SlipSurge surfaces free creation, paid setup and member Discord access as
  separate steps. [Patreon member Discord guide](https://support.patreon.com/hc/en-us/articles/4408207682061-What-is-Discord-Member)
- The new Ultimate sheet uses a straight-on 1024 × 1536 visual reference.
  Native controls and SlipSurge theme colors remain the source of truth for
  sizing, safe areas and contrast. The illustration contains no odds or stats.
- App Review and purchase coverage for the planned regions is a release gate.
  Inspected Apple's current policy for external links and digital purchases.
  [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Before expanding distribution

Confirm the intended App Store storefronts and the permitted purchase path for
SlipSurge Ultimate and creator memberships in each one. Current source has the
US Whop path and existing access management, with no StoreKit product catalog or
purchase verification in the app. Confirm entitlement refresh, restore and
support handoff using approved test accounts before describing checkout as
release-ready. Review the equivalent private sign-in option under guideline
4.8 with the existing Discord, X and Whop buttons. Review launch measurement
with the app's privacy disclosures before collecting usage data. Measure
welcome exits, preview visits, offer opens, checkout attempts and confirmed
entitlements as separate funnel stages. Keep promotions in the app unless a
separate notification consent and opt-out flow is in scope.

## Verification on November 27

- Xcode 27.2 signed the simulator build and built for Devin’s physical iPad.
  Installed SlipSurge Launch QA beside TestFlight 1.0 (9). The QA copy uses
  the separate development bundle, with no push or OAuth callback registration.
- On iPhone 18 Pro Max, navigated from the welcome creator scene to the
  chooser, opened sign-in for community setup, and browsed the live creator
  directory. On Feed, opened Ultimate, loaded the live plan comparison, selected
  annual billing and reached sign-in. Hid the Feed offer and verified its
  saved dismissal and the available Research entry.
- On the signed-in iPhone 18 Pro, opened an Ultimate slate and its Odds Board
  without an upgrade gate. The Feed had no offer. Reached the free community
  form and the creator storefront from Community. No drafts were saved,
  communities published, roles changed, or purchases made.
- On the 1170 × 2532 iPhone 17e simulator, verified the Light theme with
  Accessibility Large enabled. Fixed benefit glyph crowding, stacked plan
  price and renewal text, and verified the pinned action opened Memberships.
  Restored the simulator's previous text size. The Color mode Ultimate sheet
  was captured on iPhone 18 Pro Max at 1320 × 2868 and inspected against the
  visual reference as an adapted native layout. An independent critique found
  excess vertical space on the phone. The final signed build opens the sheet
  at a shorter expandable height on iPhone and keeps full height with
  accessibility text. Device Hub lost its window before a final phone
  capture of that height.
- On Devin’s iPad in the full-width window, opened the Ultimate and creator
  sheets and dismissed the Ultimate sheet back to Feed. The narrow iPad window,
  Reduce Motion device check, verified Free-account upgrade, and payment
  confirmation, Discord roles and private pick access across accounts remain
  release tests. The website deployment, production data and user account
  configuration were outside the implementation.
