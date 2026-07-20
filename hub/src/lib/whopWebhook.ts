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

// Temporary — every real delivery is failing verifyWhopSignature above, on
// BOTH businesses' secrets, neither of which was recently changed. That
// points at a wrong assumption in the algorithm itself (never confirmed
// against a real payload — see the comment on handleWhopWebhookRequest)
// rather than a stale secret. Tries the plausible variations of secret
// decoding × signed-content shape and reports back only WHICH combination
// (if any) matches — never the secret, the digest, or the received
// signature itself.
function diagnoseWhopSignature(rawBody: string, id: string, timestamp: string, signatureHeader: string, secret: string): string {
  const receivedSigs = signatureHeader.split(' ').map(p => p.split(',')[1]).filter(Boolean) as string[]
  const strippedSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret

  const secretVariants: [string, Buffer | null][] = [
    ['base64(strip whsec_)', (() => { try { return Buffer.from(strippedSecret, 'base64') } catch { return null } })()],
    ['utf8(strip whsec_)', Buffer.from(strippedSecret, 'utf8')],
    ['utf8(full secret incl. whsec_)', Buffer.from(secret, 'utf8')],
    ['base64(full secret incl. whsec_)', (() => { try { return Buffer.from(secret, 'base64') } catch { return null } })()],
  ]
  const contentVariants: [string, string][] = [
    ['id.timestamp.body', `${id}.${timestamp}.${rawBody}`],
    ['body only', rawBody],
    ['timestamp.body', `${timestamp}.${rawBody}`],
  ]

  const matches: string[] = []
  for (const [sLabel, secretBytes] of secretVariants) {
    if (!secretBytes) continue
    for (const [cLabel, content] of contentVariants) {
      const digestB64 = createHmac('sha256', secretBytes).update(content).digest('base64')
      const digestHex = createHmac('sha256', secretBytes).update(content).digest('hex')
      if (receivedSigs.includes(digestB64) || receivedSigs.includes(digestHex)) {
        matches.push(`secret=${sLabel} content=${cLabel}`)
      }
    }
  }
  return matches.length ? matches.join(' | ') : 'no combination matched'
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
    // Temporary — every real delivery is 400ing and this is the fastest way
    // to see WHY without guessing: which of the three Standard Webhooks
    // headers Whop is actually sending (names only, never header VALUES
    // beyond presence) versus what this code assumes.
    console.error('[whop-webhook] not configured', {
      hasId: !!id, hasTimestamp: !!timestamp, hasSignature: !!signature, hasSecret: !!secret,
      headerNames: Array.from(req.headers.keys()),
    })
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  const rawBody = await req.text()
  if (!verifyWhopSignature(rawBody, id, timestamp, signature, secret)) {
    // Temporary — diagnostic only, never logs the secret or the full
    // signature/body content.
    console.error('[whop-webhook] signature verification failed', {
      id, timestamp, bodyLength: rawBody.length,
      diagnosis: diagnoseWhopSignature(rawBody, id, timestamp, signature, secret),
    })
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
        const { data: updated } = await supabase.from('users').update({
          tier: planInfo.tier,
          whop_plan_id: planId,
          tier_status: 'active',
          tier_current_period_end: periodEnd,
          whop_membership_id: membershipId ?? null,
        }).eq('id', internalUserId).select('discord_advanced_claimed').single()
        await syncTierBadge(supabase, internalUserId, effectiveTier(planInfo.tier, updated?.discord_advanced_claimed))
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
        }).eq('id', internalUserId).select('discord_advanced_claimed').single()
        // Losing a purchased tier doesn't necessarily mean losing every
        // badge — someone who cancels the $10 add-on drops from Ultimate
        // back to Advanced (still free via the Discord plan), not to nothing.
        await syncTierBadge(supabase, internalUserId, effectiveTier('free', updated?.discord_advanced_claimed))
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
