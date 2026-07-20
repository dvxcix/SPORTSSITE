import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { effectiveTier, type Tier } from '@/lib/tiers'
import { syncTierBadge } from '@/lib/tierBadges'

// Whop isn't a Supabase-native identity, so there's no auth.unlinkIdentity()
// call for it (see verifiedIdentity.ts) — this is the equivalent hand-rolled
// endpoint, mirroring what /auth/whop/callback's handleWhopLink() writes.
// Only clears whop_user_id/discord_advanced_claimed/verified_identities.whop
// — a REAL purchased tier (tier/whop_plan_id/tier_status, set by the
// webhook off internal_user_id metadata, never whop_user_id) is untouched,
// same as unlinking Discord/X doesn't affect anything either.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createAdminClient()
  const { data: current } = await admin.from('users').select('tier, verified_identities').eq('id', user.id).maybeSingle()
  const nextVI = { ...(current?.verified_identities ?? {}) }
  delete nextVI.whop

  const { error } = await admin.from('users').update({
    whop_user_id: null,
    discord_advanced_claimed: false,
    verified_identities: nextVI,
  }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await syncTierBadge(admin, user.id, effectiveTier((current?.tier as Tier) ?? 'free', false))

  return NextResponse.json({ ok: true })
}
