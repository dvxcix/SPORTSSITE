import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasTierAccess, hasFullAccessOverride, effectiveTier, type Tier } from '@slipsurge/core/tiers'

// Every API route's auth used to assume a browser cookie session
// (@supabase/ssr) — the mobile app has no cookies at all, just an
// `Authorization: Bearer <access_token>` header from its own
// @supabase/supabase-js client (AsyncStorage-backed session, no @supabase/
// ssr involved there — that package is cookie/browser-specific). Every
// tier-gated route already goes through requireTier/getEffectiveTier, so
// resolving the bearer path here covers the whole gated API surface
// without touching each route individually. Setting the token as the
// client's own Authorization header (not just passing it to getUser) means
// every downstream `.from(...)` query on the returned client is evaluated
// under RLS as that real user, not the anon role — identical behavior to
// the cookie-session path, just a different transport for the same JWT.
async function resolveAuthedClient(): Promise<{ supabase: SupabaseClient; userId: string | null }> {
  const bearer = (await headers()).get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${bearer}` } } }
    )
    const { data: { user } } = await supabase.auth.getUser(bearer)
    return { supabase, userId: user?.id ?? null }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}

// Same { error?: NextResponse } return shape used by requireAdmin() across
// hub/src/app/api/admin/*/route.ts — call site pattern:
//   const gate = await requireTier('basic'); if (gate.error) return gate.error
export async function requireTier(minTier: Tier): Promise<{ error?: NextResponse; userId?: string }> {
  const { userId } = await resolveAuthedClient()
  if (!userId) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data } = await createAdminClient().from('users').select('tier, account_type, beta_access_active, discord_advanced_claimed, admin_granted_tier').eq('id', userId).single()
  const userTier = effectiveTier((data?.tier as Tier | undefined) ?? 'free', data?.discord_advanced_claimed, data?.admin_granted_tier as Tier | null)

  if (hasFullAccessOverride(data?.account_type, data?.beta_access_active) || hasTierAccess(userTier, minTier)) {
    return { userId }
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
  const { userId } = await resolveAuthedClient()
  if (!userId) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data } = await createAdminClient().from('users').select('tier, account_type, beta_access_active, discord_advanced_claimed, admin_granted_tier').eq('id', userId).single()
  const tier: Tier = hasFullAccessOverride(data?.account_type, data?.beta_access_active)
    ? 'ultimate'
    : effectiveTier((data?.tier as Tier | undefined) ?? 'free', data?.discord_advanced_claimed, data?.admin_granted_tier as Tier | null)
  return { userId, tier }
}
