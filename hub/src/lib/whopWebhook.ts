import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS } from '@/lib/tiers'

// Shared by both /api/webhooks/whop (the main tier-payments Whop business,
// WHOP_WEBHOOK_KEY) and /api/webhooks/whop-addon (the entirely separate
// Discord-community business the $10 Ultimate add-on lives under,
// ADDON_WHOP_WEBHOOK) — same Standard Webhooks verification and event
// handling either way, just a different signing secret per business. Kept
// as one function instead of duplicating the route so the two can't drift.

// Whop follows the Standard Webhooks spec (same scheme as Svix): three
// headers (webhook-id, webhook-timestamp, webhook-signature), signed content
// is "{id}.{timestamp}.{rawBody}", HMAC-SHA256 with the base64-decoded
// secret, base64-encoded result, compared against the "v1,<sig>" value(s) in
// the signature header (space-separated if there are multiple).
function verifyWhopSignature(rawBody: string, id: string, timestamp: string, signatureHeader: string, secret: string): boolean {
  const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64')
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
// Whop's public docs don't expose a full payload schema for these events as
// of writing (confirmed via direct doc fetches, only field lists without
// examples). MUST be confirmed against a real payload — either Whop's
// dashboard "send test webhook" feature or the first real purchase — before
// trusting this in production. See plan doc verification step 4.
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
        await supabase.from('users').update({
          tier: planInfo.tier,
          whop_plan_id: planId,
          tier_status: 'active',
          tier_current_period_end: periodEnd,
          whop_membership_id: membershipId ?? null,
        }).eq('id', internalUserId)
        break
      }
      case 'payment.failed':
      case 'membership.deactivated':
      case 'membership.went_invalid': {
        if (!internalUserId) {
          console.error('[whop-webhook] no metadata.internal_user_id on', type, JSON.stringify(event))
          break
        }
        await supabase.from('users').update({
          tier: 'free',
          tier_status: type,
        }).eq('id', internalUserId)
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
