import type { createClient } from '@/lib/supabase/server'

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

// Current beta cohort (169 holders, awarded via /admin/badges) gets unconditional
// full access until the beta program closes — see plan doc's Context section for
// why this exists and how it ends (badge revocation, not code). Hardcoded as an
// id rather than looked up by name since badge names are editable admin text
// with no fixed slug — the id stays stable even if the badge gets renamed.
export const BETA_TESTER_BADGE_ID = '0274b9c7-1119-473c-ad03-380691e69dac'

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

// Reused by both TierGate (page rendering) and requireTier (API routes) — admin
// or beta-badge holder bypasses tier requirements entirely, same as FeatureGate's
// admin-preview treatment.
export async function hasFullAccessOverride(
  supabase: ServerSupabaseClient,
  userId: string,
  accountType: string | null | undefined
): Promise<boolean> {
  if (accountType === 'admin') return true
  const { data } = await supabase
    .from('user_badges')
    .select('id')
    .eq('user_id', userId)
    .eq('badge_id', BETA_TESTER_BADGE_ID)
    .maybeSingle()
  return !!data
}
