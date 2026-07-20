import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { WHOP_PLANS, effectiveTier, type Tier } from '@/lib/tiers'
import { syncTierBadge } from '@/lib/tierBadges'

export const revalidate = 0

// Accepts either a real signed-in admin session OR the same cron bearer
// token every other server-to-server admin route already accepts — this
// one specifically needs to be triggerable outside a browser (urgent
// reconciliation, re-runnable any time) without that meaning "open to
// anyone."
async function requireAdmin(req: Request) {
  if (!requireBrowserbaseCronAuth(req)) return {}
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// Emergency backstop for the addon Whop business's webhook never having
// been registered in that Whop dashboard (confirmed live: zero requests to
// /api/webhooks/whop-addon ever, despite real checkout-session completions
// — two real customers paid for the $10 add-on and never got Ultimate).
// Pulls the addon business's own membership records directly via
// ADDON_WHOP_KEY (no webhook needed) and applies the exact same grant the
// webhook would have, for anyone it missed. Safe to re-run — every write is
// idempotent (same update/upsert the webhook path uses).
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const apiKey = process.env.ADDON_WHOP_KEY
  if (!apiKey) return NextResponse.json({ error: 'ADDON_WHOP_KEY is not configured' }, { status: 500 })

  const planId = 'plan_Q1Ey6RMgjS9XQ'
  const planInfo = WHOP_PLANS[planId]

  // v1 with ?plan= came back "not authorized" against this specific key
  // (confirmed live) despite the key working fine for v2 checkout_sessions
  // creation — try v2 (matching the endpoint version already proven to work
  // for this exact key) before giving up, since Whop's own docs disagree
  // with themselves on membership-listing paths (same undocumented-API
  // problem as everywhere else Whop is touched in this codebase).
  const candidates = [
    `https://api.whop.com/api/v2/memberships?plan_id=${planId}`,
    `https://api.whop.com/api/v2/memberships?plan=${planId}`,
    `https://api.whop.com/api/v1/memberships?plan_id=${planId}`,
  ]
  let res: Response | null = null
  let lastErr = ''
  for (const url of candidates) {
    const attempt = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (attempt.ok) { res = attempt; break }
    lastErr = `${url} -> ${attempt.status} ${await attempt.text().catch(() => '')}`
  }
  if (!res) {
    return NextResponse.json({ error: `Whop memberships lookup failed on every candidate path. Last: ${lastErr}` }, { status: 502 })
  }
  const body = await res.json().catch(() => null)
  const memberships: any[] = body?.data ?? body?.memberships ?? (Array.isArray(body) ? body : [])

  const admin = createAdminClient()
  const results: any[] = []

  for (const m of memberships) {
    // Defensive across a few plausible field shapes — same reasoning as the
    // webhook handler, since this is the same API family with the same
    // undocumented-payload problem.
    const status: string | undefined = m.status ?? m.valid_status
    const isActive = status === 'active' || status === 'valid' || m.valid === true
    const internalUserId: string | undefined = m.metadata?.internal_user_id
    const membershipId: string | undefined = m.id
    const periodEndRaw = m.renewal_period_end ?? m.period_end ?? m.expires_at
    const periodEnd = typeof periodEndRaw === 'number'
      ? new Date(periodEndRaw * 1000).toISOString()
      : typeof periodEndRaw === 'string' ? periodEndRaw : null

    if (!internalUserId) {
      results.push({ membershipId, status, skipped: 'no internal_user_id in metadata' })
      continue
    }
    if (!isActive) {
      results.push({ membershipId, internalUserId, status, skipped: 'not active' })
      continue
    }

    const { data: updated, error } = await admin.from('users').update({
      tier: planInfo.tier,
      whop_plan_id: planId,
      tier_status: 'active',
      tier_current_period_end: periodEnd,
      whop_membership_id: membershipId ?? null,
    }).eq('id', internalUserId).select('username, discord_advanced_claimed').single()

    if (error || !updated) {
      results.push({ membershipId, internalUserId, error: error?.message ?? 'user not found' })
      continue
    }

    await syncTierBadge(admin, internalUserId, effectiveTier(planInfo.tier as Tier, updated.discord_advanced_claimed))
    results.push({ membershipId, internalUserId, username: updated.username, status, granted: planInfo.tier })
  }

  return NextResponse.json({ totalMemberships: memberships.length, results })
}
