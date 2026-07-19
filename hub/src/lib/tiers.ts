export type Tier = 'free' | 'basic' | 'advanced' | 'ultimate'

const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, advanced: 2, ultimate: 3 }

export function hasTierAccess(userTier: Tier, required: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required]
}

// The 5 real Whop plans backing paid tiers — see plan doc for how these were
// sourced. Basic has no annual plan (deliberately, per the pricing design).
export const WHOP_PLANS: Record<string, { tier: Exclude<Tier, 'free'>; interval: 'monthly' | 'annual'; label: string }> = {
  plan_C0wvFkX0sqiPm: { tier: 'basic', interval: 'monthly', label: 'Basic — Monthly' },
  plan_3QSVT9Mr4cxVt: { tier: 'advanced', interval: 'monthly', label: 'Advanced — Monthly' },
  plan_3HbuZZv6vhNu9: { tier: 'advanced', interval: 'annual', label: 'Advanced — Annual' },
  plan_tCrVAX62uKyEq: { tier: 'ultimate', interval: 'monthly', label: 'Ultimate — Monthly' },
  plan_1eWRTXv0XXTrI: { tier: 'ultimate', interval: 'annual', label: 'Ultimate — Annual' },
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
export function hasFullAccessOverride(
  accountType: string | null | undefined,
  betaAccessActive: boolean | null | undefined
): boolean {
  return accountType === 'admin' || !!betaAccessActive
}
