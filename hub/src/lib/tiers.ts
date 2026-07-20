export type Tier = 'free' | 'basic' | 'advanced' | 'ultimate'

export const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, advanced: 2, ultimate: 3 }
export const TIER_LABEL: Record<Tier, string> = { free: 'Free', basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }

export function hasTierAccess(userTier: Tier, required: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required]
}

// The 5 real Whop plans backing paid tiers — see plan doc for how these were
// sourced. Basic has no annual plan (deliberately, per the pricing design).
// `company` marks which Whop business a plan lives under — 'main' (default,
// omitted) is the WHOP_API_KEY/WHOP_WEBHOOK_KEY business every normal
// customer pays into; 'addon' is the entirely separate Whop business the
// Discord-community plan (and this add-on) live under, using its own
// ADDON_WHOP_KEY/ADDON_WHOP_WEBHOOK credentials. A plan id only exists in
// ONE of these two businesses — using the wrong key 404s ("No such Plan
// found"), confirmed live. See checkoutApiKeyFor() / the addon webhook route.
export const WHOP_PLANS: Record<string, { tier: Exclude<Tier, 'free'>; interval: 'monthly' | 'annual'; label: string; company?: 'addon' }> = {
  plan_C0wvFkX0sqiPm: { tier: 'basic', interval: 'monthly', label: 'Basic — Monthly' },
  plan_3QSVT9Mr4cxVt: { tier: 'advanced', interval: 'monthly', label: 'Advanced — Monthly' },
  plan_3HbuZZv6vhNu9: { tier: 'advanced', interval: 'annual', label: 'Advanced — Annual' },
  plan_tCrVAX62uKyEq: { tier: 'ultimate', interval: 'monthly', label: 'Ultimate — Monthly' },
  plan_1eWRTXv0XXTrI: { tier: 'ultimate', interval: 'annual', label: 'Ultimate — Annual' },
  // $10/mo add-on for people who already get Advanced free via the Discord
  // community plan (see effectiveTier/discord_advanced_claimed below) — buying
  // this on top bumps them to Ultimate through the exact same checkout/webhook
  // path every other plan uses, just at the discounted add-on price, under the
  // addon Whop business. Not shown on the public /pricing page — only
  // surfaced on /settings/membership to accounts that already have the claim,
  // since it's meaningless without it.
  plan_Q1Ey6RMgjS9XQ: { tier: 'ultimate', interval: 'monthly', label: 'Ultimate Add-on — Discord Members', company: 'addon' },
}

// Which WHOP_API_KEY-equivalent env var a checkout session for this plan
// must be created with — picking the wrong one 404s, since a plan id only
// ever exists under one of the two separate Whop businesses.
export function checkoutApiKeyEnvFor(planId: string): 'ADDON_WHOP_KEY' | 'WHOP_API_KEY' {
  return WHOP_PLANS[planId]?.company === 'addon' ? 'ADDON_WHOP_KEY' : 'WHOP_API_KEY'
}

// Current beta cohort (169 users, backfilled from who held the "Beta Tester"
// badge at the time beta access was decoupled from it) gets unconditional
// full access until the beta program closes — tracked on users.beta_access_active,
// DELIBERATELY SEPARATE from the "Beta Tester" badge itself. The badge is a
// permanent achievement/reward shown on a profile forever; this flag is the
// temporary access grant. Ending beta access later means flipping this flag
// off — it must never touch user_badges, or it'd silently strip people of an
// achievement they earned just because a subscription window closed.
//
// Reused by both TierGate (page rendering) and requireTier (API routes) —
// admin or active beta access bypasses tier requirements entirely, same as
// FeatureGate's admin-preview treatment.
// Holding the Discord-community Whop plan bundles Advanced in for free —
// "claimed" at Whop OAuth login (see auth/whop/callback), re-synced every
// login since there's no webhook for it. This never lowers a real paid
// tier — someone who bought Ultimate directly stays Ultimate even without
// the claim, and someone with the claim who also buys the $10 add-on plan
// (WHOP_PLANS.plan_Q1Ey6RMgjS9XQ) already has their `tier` column at
// 'ultimate' from that purchase, so this only ever raises the floor, never
// substitutes for a real purchase.
//
// adminGrantedTier is the same kind of floor-raise, set from /admin/users
// (users.admin_granted_tier) instead of a Discord membership — deliberately
// a separate column from `tier` (which only the Whop webhook/reconcile
// crons write) so a manual grant can never be silently overwritten by a
// real Whop event for that account, and never substitutes for what was
// actually purchased either.
export function effectiveTier(rawTier: Tier, discordAdvancedClaimed: boolean | null | undefined, adminGrantedTier?: Tier | null): Tier {
  let t = rawTier
  if (discordAdvancedClaimed && TIER_RANK[t] < TIER_RANK.advanced) t = 'advanced'
  if (adminGrantedTier && TIER_RANK[adminGrantedTier] > TIER_RANK[t]) t = adminGrantedTier
  return t
}

export function hasFullAccessOverride(
  accountType: string | null | undefined,
  betaAccessActive: boolean | null | undefined
): boolean {
  return accountType === 'admin' || !!betaAccessActive
}
