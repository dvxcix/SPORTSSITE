import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, effectiveTier } from '@/lib/tiers'
import { syncTierBadge } from '@/lib/tierBadges'

// Shared by both /api/webhooks/whop (the main tier-payments Whop business,
// WHOP_WEBHOOK_KEY) and /api/webhooks/whop-addon (the entirely separate
// Discord-community business the $10 Ultimate add-on lives under,
// ADDON_WHOP_WEBHOOK) — same Standard Webhooks verification and event
// handling either way, just a different signing secret per business. Kept
// as one function instead of duplicating the route so the two can't drift.

// Whop's real scheme, confirmed live against actual event deliveries on
// both businesses (every one matched exactly one combination out of several
// tried): three headers (webhook-id, webhook-timestamp, webhook-signature),
// signed content is "{id}.{timestamp}.{rawBody}", HMAC-SHA256 keyed with the
// secret's RAW UTF-8 BYTES (not base64-decoded — the earlier assumption,
// copied from the generic Standard Webhooks/Svix spec, was wrong for Whop
// specifically), base64-encoded result, compared against the "v1,<sig>"
// value(s) in the signature header (space-separated if there are multiple).
function verifyWhopSignature(rawBody: string, id: string, timestamp: string, signatureHeader: string, secret: string): boolean {
  const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'utf8')
  const expected = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
  const expectedBuf = Buffer.from(expected)
  return signatureHeader.split(' ').some(part => {
    const sig = part.split(',')[1]
    if (!sig) return false
    const sigBuf = Buffer.from(sig)
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)
  })
}

// Field names below (event.action vs event.type, data.plan_id vs
// data.plan?.id, etc.) are read defensively across a few plausible shapes —
// Whop's public docs don't expose a full payload schema for these events.
// MUST be confirmed against a real payload's actual field names before
// trusting the tier/plan extraction below (signature verification itself is
// now confirmed correct — see verifyWhopSignature).
export async function handleWhopWebhookRequest(req: Request, secret: string | undefined): Promise<NextResponse> {
  const id = req.headers.get('webhook-id')
  const timestamp = req.headers.get('webhook-timestamp')
  const signature = req.headers.get('webhook-signature')
  if (!id || !timestamp || !signature || !secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  const rawBody = await req.text()
  if (!verifyWhopSignature(rawBody, id, timestamp, signature, secret)) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    const type: string | undefined = event?.action ?? event?.type ?? event?.event
    const data = event?.data ?? event
    const metadata = data?.metadata ?? {}
    const internalUserId: string | undefined = metadata?.internal_user_id
    const planId: string | undefined = data?.plan_id ?? data?.plan?.id
    const membershipId: string | undefined = data?.membership_id ?? data?.id
    const periodEndRaw = data?.renewal_period_end ?? data?.period_end ?? data?.expires_at
    const periodEnd = typeof periodEndRaw === 'number'
      ? new Date(periodEndRaw * 1000).toISOString()
      : typeof periodEndRaw === 'string' ? periodEndRaw : null

    // Temporary — signature verification is now confirmed correct, but the
    // event-type strings this switch matches against (dot-separated,
    // e.g. "membership.activated") were never confirmed against a real
    // payload either. One line, no payload contents, removed once confirmed.
    if (!['payment.succeeded', 'membership.activated', 'membership.went_valid', 'payment.failed', 'membership.deactivated', 'membership.went_invalid'].includes(type ?? '')) {
      console.error('[whop-webhook] unrecognized event type', { type })
    }

    switch (type) {
      case 'payment.succeeded':
      case 'membership.activated':
      case 'membership.went_valid': {
        if (!internalUserId) {
          console.error('[whop-webhook] no metadata.internal_user_id on', type, JSON.stringify(event))
          break
        }
        const planInfo = planId ? WHOP_PLANS[planId] : undefined
        if (!planInfo) {
          // Not one of our tier plans — e.g. the separate beta-cohort
          // product, or a Discord-business event unrelated to the add-on.
          break
        }
        const { data: updated } = await supabase.from('users').update({
          tier: planInfo.tier,
          whop_plan_id: planId,
          tier_status: 'active',
          tier_current_period_end: periodEnd,
          whop_membership_id: membershipId ?? null,
        }).eq('id', internalUserId).select('discord_advanced_claimed, admin_granted_tier').single()
        await syncTierBadge(supabase, internalUserId, effectiveTier(planInfo.tier, updated?.discord_advanced_claimed, updated?.admin_granted_tier))
        break
      }
      case 'payment.failed':
      case 'membership.deactivated':
      case 'membership.went_invalid': {
        if (!internalUserId) {
          console.error('[whop-webhook] no metadata.internal_user_id on', type, JSON.stringify(event))
          break
        }
        const { data: updated } = await supabase.from('users').update({
          tier: 'free',
          tier_status: type,
        }).eq('id', internalUserId).select('discord_advanced_claimed, admin_granted_tier').single()
        // Losing a purchased tier doesn't necessarily mean losing every
        // badge — someone who cancels the $10 add-on drops from Ultimate
        // back to Advanced (still free via the Discord plan or an admin
        // grant), not to nothing.
        await syncTierBadge(supabase, internalUserId, effectiveTier('free', updated?.discord_advanced_claimed, updated?.admin_granted_tier))
        break
      }
      default:
        break
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
