import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasTierAccess, hasFullAccessOverride, effectiveTier, type Tier } from '@/lib/tiers'

// Same { error?: NextResponse } return shape used by requireAdmin() across
// hub/src/app/api/admin/*/route.ts — call site pattern:
//   const gate = await requireTier('basic'); if (gate.error) return gate.error
export async function requireTier(minTier: Tier): Promise<{ error?: NextResponse; userId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data } = await supabase.from('users').select('tier, account_type, beta_access_active, discord_advanced_claimed, admin_granted_tier').eq('id', user.id).single()
  const userTier = effectiveTier((data?.tier as Tier | undefined) ?? 'free', data?.discord_advanced_claimed, data?.admin_granted_tier as Tier | null)

  if (hasFullAccessOverride(data?.account_type, data?.beta_access_active) || hasTierAccess(userTier, minTier)) {
    return { userId: user.id }
  }
  return { error: NextResponse.json({ error: 'Upgrade required' }, { status: 403 }) }
}

// For routes shared across pages with DIFFERENT tier floors (e.g.
// /api/dugout/data serves Pitcher Report at 'basic', The Public at
// 'advanced', and Dugout/Batter Cost at 'ultimate') — returns the caller's
// real effective tier instead of a single pass/fail, so the route can reject
// below its lowest legitimate floor and then compute/return only the field
// subset that tier is actually entitled to. A full-access override
// (admin/beta) always resolves to 'ultimate' — same as requireTier.
export async function getEffectiveTier(): Promise<{ error?: NextResponse; userId?: string; tier?: Tier }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data } = await supabase.from('users').select('tier, account_type, beta_access_active, discord_advanced_claimed, admin_granted_tier').eq('id', user.id).single()
  const tier: Tier = hasFullAccessOverride(data?.account_type, data?.beta_access_active)
    ? 'ultimate'
    : effectiveTier((data?.tier as Tier | undefined) ?? 'free', data?.discord_advanced_claimed, data?.admin_granted_tier as Tier | null)
  return { userId: user.id, tier }
}
