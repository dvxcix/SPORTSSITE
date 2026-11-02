export type Tier = 'free' | 'basic' | 'advanced' | 'ultimate'

export const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, advanced: 2, ultimate: 3 }
export const TIER_LABEL: Record<Tier, string> = { free: 'Free', basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }

export function hasTierAccess(userTier: Tier, required: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required]
}

// Historical and current Whop plans backing paid tiers. Historical plans stay
// recognized for existing members even when they are no longer offered.
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
  plan_2uISqRWL3Re5v: { tier: 'ultimate', interval: 'monthly', label: 'Ultimate — Monthly' },
  plan_Brp4I5MDssXY0: { tier: 'ultimate', interval: 'annual', label: 'Ultimate — Annual' },
  // $10/mo Ultimate for eligible Discord community members, billed by the
  // separate add-on Whop business. The claim alone does not grant access.
  plan_Q1Ey6RMgjS9XQ: { tier: 'ultimate', interval: 'monthly', label: 'Ultimate Add-on — Discord Members', company: 'addon' },
}

// Existing subscriptions still need all of WHOP_PLANS for reconciliation,
// webhooks and cancellation. New sales are deliberately a separate policy.
export const ULTIMATE_CHECKOUT_PLAN_ID = 'plan_2uISqRWL3Re5v'
export const ULTIMATE_ANNUAL_CHECKOUT_PLAN_ID = 'plan_Brp4I5MDssXY0'
export const DISCORD_ULTIMATE_ADDON_PLAN_ID = 'plan_Q1Ey6RMgjS9XQ'

export function isOfferedWhopPlan(planId: string): boolean {
  return planId === ULTIMATE_CHECKOUT_PLAN_ID || planId === ULTIMATE_ANNUAL_CHECKOUT_PLAN_ID || planId === DISCORD_ULTIMATE_ADDON_PLAN_ID
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
// Discord community membership determines eligibility for the discounted
// add-on, but no longer grants an access tier by itself. Keep the argument
// for existing callers; entitlement comes from the purchased or admin tier.
//
// adminGrantedTier is a floor-raise, set from /admin/users
// (users.admin_granted_tier) — deliberately
// a separate column from `tier` (which only the Whop webhook/reconcile
// crons write) so a manual grant can never be silently overwritten by a
// real Whop event for that account, and never substitutes for what was
// actually purchased either.
export function effectiveTier(rawTier: Tier, discordAdvancedClaimed: boolean | null | undefined, adminGrantedTier?: Tier | null): Tier {
  void discordAdvancedClaimed
  let t = rawTier
  if (adminGrantedTier && TIER_RANK[adminGrantedTier] > TIER_RANK[t]) t = adminGrantedTier
  return t
}

export function hasFullAccessOverride(
  accountType: string | null | undefined,
  betaAccessActive: boolean | null | undefined
): boolean {
  return accountType === 'admin' || !!betaAccessActive
}
