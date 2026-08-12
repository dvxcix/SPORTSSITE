import { NextResponse, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, effectiveTier } from '@slipsurge/core/tiers'
import { syncTierBadge } from '@/lib/tierBadges'
import { sendXConversion } from '@/lib/xConversion'
import { syncDiscordRoleForUser } from '@/lib/discord'
import { alertUnexpectedChargeAfterCancel } from '@/lib/billingAlert'
import { whopCancellationKeepsAccess, whopMembershipPeriodEnd } from '@/lib/whopMembershipAccess'

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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function objectId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  return stringValue((value as Record<string, unknown>).id)
}

const ACTIONABLE_EVENT_TYPES = new Set([
  'payment.succeeded',
  'membership.activated',
  'membership.went_valid',
  'payment.failed',
  'membership.deactivated',
  'membership.went_invalid',
  'membership.cancel_at_period_end_changed',
])

// Whop also delivers lifecycle events that are useful for its own audit
// trail but do not change a SlipSurge membership or creator entitlement.
// Acknowledge them normally so they do not become false production errors.
const PASSIVE_EVENT_TYPES = new Set([
  'payment.created',
  'membership.trial_ending_soon',
  'withdrawal.updated',
  'ledger_account.funds_available',
])

// Field names below (event.action vs event.type, data.plan_id vs
// data.plan?.id, etc.) are read defensively across a few plausible shapes —
// Whop's public docs don't expose a full payload schema for these events.
// MUST be confirmed against a real payload's actual field names before
// trusting the tier/plan extraction below (signature verification itself is
// now confirmed correct — see verifyWhopSignature).
export async function handleWhopWebhookRequest(
  req: Request,
  secret: string | undefined,
  source: 'main' | 'addon' = 'main',
): Promise<NextResponse> {
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

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const type = [event.action, event.type, event.event].find((value): value is string => typeof value === 'string')

  const { data: existingReceipt } = await supabase
    .from('provider_webhook_events')
    .select('id,status,updated_at,attempt_count')
    .eq('provider', 'whop')
    .eq('provider_event_id', id)
    .maybeSingle()
  if (existingReceipt?.status === 'succeeded' || existingReceipt?.status === 'ignored') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (existingReceipt?.status === 'processing' && Date.now() - new Date(existingReceipt.updated_at).getTime() < 10 * 60_000) {
    return NextResponse.json({ received: true, processing: true })
  }
  if (existingReceipt) {
    await supabase.from('provider_webhook_events').update({
      event_type: type ?? null,
      status: 'processing',
      attempt_count: Number(existingReceipt.attempt_count || 1) + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', existingReceipt.id)
  } else {
    const { error: receiptError } = await supabase.from('provider_webhook_events').insert({
      provider: 'whop', provider_event_id: id, event_type: type ?? null,
    })
    if (receiptError?.code === '23505') return NextResponse.json({ received: true, duplicate: true })
    if (receiptError) return NextResponse.json({ error: 'Webhook receipt could not be recorded' }, { status: 500 })
  }

  async function finalizeReceipt(status: 'succeeded' | 'failed' | 'ignored', error?: string) {
    await supabase.from('provider_webhook_events').update({
      status,
      last_error: error?.slice(0, 2000) ?? null,
      processed_at: status === 'failed' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('provider', 'whop').eq('provider_event_id', id)
  }

  try {
    const data = (event.data && typeof event.data === 'object' ? event.data : event) as Record<string, unknown>
    const metadata = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>
    const internalUserId = stringValue(metadata.internal_user_id)
    const creatorProductId = stringValue(metadata.slipsurge_product_id)
    const creatorId = stringValue(metadata.slipsurge_creator_id)
    const planId = stringValue(data.plan_id) ?? objectId(data.plan)
    // Real bug (confirmed via Whop's actual payment.succeeded schema): on a
    // payment event, `data` is the PAYMENT object, and its own real
    // membership reference lives at `data.membership` (a plain "mem_..."
    // string) — there is no `data.membership_id` field, so the old
    // `data?.membership_id ?? data?.id` fell through to `data.id`, which on
    // a payment event is the PAYMENT's own "pay_..." id, not a membership
    // id. That got written straight into users.whop_membership_id, so any
    // later cancelWhopMembership() call sent Whop's cancel endpoint a
    // payment id and got back a real "No such Membership found" 404. On a
    // membership.* event `data` genuinely IS the membership resource (no
    // `.membership` field on itself), so this still correctly falls through
    // to `data.id` there — unchanged for that case.
    const membershipId = stringValue(data.membership) ?? objectId(data.membership) ?? stringValue(data.membership_id) ?? stringValue(data.id)
    const periodEnd = whopMembershipPeriodEnd(data)

    // Temporary — signature verification is now confirmed correct, but the
    // event-type strings this switch matches against (dot-separated,
    // e.g. "membership.activated") were never confirmed against a real
    // payload either. One line, no payload contents, removed once confirmed.
    if (creatorProductId && creatorId) {
      await supabase.from('creator_commerce_events').upsert({
        creator_id: creatorId,
        product_id: creatorProductId,
        event_type: type || 'unknown',
        provider_event_id: id,
        provider_object_id: data?.id || null,
        amount: data?.subtotal ?? data?.amount ?? data?.total ?? null,
        currency: data?.currency || 'usd',
        status: data?.status || null,
        metadata: { membership_id: membershipId || null },
      }, { onConflict: 'provider_event_id' })

      if (internalUserId && ['payment.succeeded', 'membership.activated', 'membership.went_valid'].includes(type || '')) {
        await supabase.from('creator_entitlements').upsert({ user_id: internalUserId, creator_id: creatorId, product_id: creatorProductId, whop_membership_id: membershipId || null, status: 'active', current_period_end: periodEnd, updated_at: new Date().toISOString() }, { onConflict: 'user_id,product_id' })
        const { data: entitledGroups } = await supabase.from('groups').select('id,channel_id').eq('creator_product_id', creatorProductId)
        for (const group of entitledGroups || []) {
          await supabase.from('group_members').upsert({ group_id: group.id, user_id: internalUserId, role: 'member' }, { onConflict: 'group_id,user_id', ignoreDuplicates: true })
          if (group.channel_id) await supabase.from('channel_members').upsert({ channel_id: group.channel_id, user_id: internalUserId }, { onConflict: 'channel_id,user_id', ignoreDuplicates: true })
        }
      } else if (internalUserId && type === 'membership.deactivated' && whopCancellationKeepsAccess(data)) {
        await supabase.from('creator_entitlements').update({ status: 'active', current_period_end: periodEnd, updated_at: new Date().toISOString() }).eq('user_id', internalUserId).eq('product_id', creatorProductId)
      } else if (internalUserId && ['payment.failed', 'membership.deactivated', 'membership.went_invalid'].includes(type || '')) {
        await supabase.from('creator_entitlements').update({ status: type === 'payment.failed' ? 'past_due' : 'expired', updated_at: new Date().toISOString() }).eq('user_id', internalUserId).eq('product_id', creatorProductId)
      }
      await finalizeReceipt('succeeded')
      return NextResponse.json({ received: true })
    }

    if (!type || PASSIVE_EVENT_TYPES.has(type) || !ACTIONABLE_EVENT_TYPES.has(type)) {
      await finalizeReceipt('ignored')
      return NextResponse.json({ received: true, ignored: true })
    }

    let resolvedInternalUserId = internalUserId
    if (!resolvedInternalUserId && membershipId) {
      const { data: membershipOwner } = await supabase
        .from('users')
        .select('id')
        .eq('whop_membership_id', membershipId)
        .maybeSingle()
      resolvedInternalUserId = membershipOwner?.id
    }

    switch (type) {
      case 'payment.succeeded':
      case 'membership.activated':
      case 'membership.went_valid': {
        if (!resolvedInternalUserId) {
          // Provider-wide and connected-creator events can legitimately land
          // on these endpoints. Without SlipSurge metadata or a membership
          // already linked to one of our users, the event is not allowed to
          // mutate a member account. Never log the raw provider payload: it
          // can contain customer email, address, and payment metadata.
          break
        }
        const planInfo = planId ? WHOP_PLANS[planId] : undefined
        if (!planInfo) {
          // Not one of our tier plans — e.g. the separate beta-cohort
          // product, or a Discord-business event unrelated to the add-on.
          break
        }
        if ((source === 'addon') !== (planInfo.company === 'addon')) break
        // This event fires on every recurring renewal payment too, not just
        // the first purchase — only stamp tier_purchased_at when it's
        // currently unset, so it tracks when the CURRENT subscription
        // started, not the most recent renewal. Cleared on cancellation
        // below, so a later resubscribe gets its own fresh start date.
        const { data: existing } = await supabase.from('users').select('tier_purchased_at, tier_cancel_at_period_end, email').eq('id', resolvedInternalUserId).maybeSingle()
        const isFirstPurchase = !existing?.tier_purchased_at
        // Real confirmed bug: a payment CAN still land on a membership that
        // was already marked cancel-at-period-end — Whop's own cancellation
        // doesn't always take effect before the next charge fires (see
        // whop.ts's isTrialingMembership fix for the trial-conversion case
        // of this). The old code here assumed that could never happen and
        // silently cleared the flag as if the member had just resubscribed
        // — a real "I cancelled but got charged anyway" complaint with no
        // record of it ever existing. Still grant the tier (the charge is
        // real, they paid), but flag it loudly instead of pretending
        // nothing happened.
        const wasAlreadyCancelling = existing?.tier_cancel_at_period_end === true
        const { data: updated } = await supabase.from('users').update({
          tier: planInfo.tier,
          whop_plan_id: planId,
          tier_status: 'active',
          tier_current_period_end: periodEnd,
          whop_membership_id: membershipId ?? null,
          tier_purchased_at: existing?.tier_purchased_at ?? new Date().toISOString(),
          tier_cancel_at_period_end: false,
        }).eq('id', resolvedInternalUserId).select('discord_advanced_claimed, admin_granted_tier, email').single()
        await syncTierBadge(supabase, resolvedInternalUserId, effectiveTier(planInfo.tier, updated?.discord_advanced_claimed, updated?.admin_granted_tier))
        await syncDiscordRoleForUser(supabase, resolvedInternalUserId)
        if (wasAlreadyCancelling) {
          await alertUnexpectedChargeAfterCancel(supabase, {
            userId: resolvedInternalUserId, email: existing?.email ?? updated?.email ?? null, membershipId: membershipId ?? null, planTier: planInfo.tier,
          })
        }
        // Only a genuine first-time purchase, never a renewal (see the
        // comment above on tier_purchased_at) — fire-and-forget via after(),
        // same reasoning as the signup call sites: must never delay this
        // webhook's ack to Whop or fail the tier grant itself.
        if (isFirstPurchase && updated?.email) {
          const email = updated.email
          after(() => sendXConversion({ eventType: 'purchase', conversionId: `purchase-${resolvedInternalUserId}`, email }))
        }
        break
      }
      case 'payment.failed':
      case 'membership.deactivated':
      case 'membership.went_invalid': {
        if (!resolvedInternalUserId) {
          break
        }
        // A failed/deactivated event about a DIFFERENT membership than the
        // one currently on file must never clobber an already-active
        // subscription — confirmed live: a customer with a real succeeded
        // Basic payment got silently reset to Free because a payment.failed
        // event for an unrelated abandoned Ultimate-trial attempt (same
        // person, different membership — nothing here stops someone holding
        // concurrent memberships on more than one plan) fired after the
        // success event and this handler reset tier unconditionally. Only
        // downgrade when the event is actually about the membership that's
        // driving the user's current tier.
        const { data: current } = await supabase.from('users').select('whop_membership_id,whop_plan_id,tier_cancel_at_period_end,tier_current_period_end').eq('id', resolvedInternalUserId).maybeSingle()
        if (!membershipId || current?.whop_membership_id !== membershipId) {
          break
        }
        const currentPlan = current.whop_plan_id ? WHOP_PLANS[current.whop_plan_id] : undefined
        if (currentPlan && (source === 'addon') !== (currentPlan.company === 'addon')) break
        const storedPeriodEnd = current.tier_current_period_end && Number.isFinite(Date.parse(current.tier_current_period_end))
          ? new Date(current.tier_current_period_end).toISOString()
          : null
        const cancellationPeriodEnd = periodEnd ?? storedPeriodEnd
        const scheduledCancellation = type === 'membership.deactivated'
          && cancellationPeriodEnd !== null
          && Date.parse(cancellationPeriodEnd) > Date.now()
          && (data.cancel_at_period_end === true || current.tier_cancel_at_period_end === true)
        if (scheduledCancellation) {
          await supabase.from('users').update({
            tier_status: 'canceling',
            tier_current_period_end: cancellationPeriodEnd,
            tier_cancel_at_period_end: true,
          }).eq('id', resolvedInternalUserId)
          break
        }
        const { data: updated } = await supabase.from('users').update({
          tier: 'free',
          tier_status: type,
          tier_purchased_at: null,
          tier_cancel_at_period_end: false,
        }).eq('id', resolvedInternalUserId).select('discord_advanced_claimed, admin_granted_tier').single()
        // Losing a purchased tier doesn't necessarily mean losing every
        // badge — someone who cancels the $10 add-on drops from Ultimate
        // back to Advanced (still free via the Discord plan or an admin
        // grant), not to nothing.
        await syncTierBadge(supabase, resolvedInternalUserId, effectiveTier('free', updated?.discord_advanced_claimed, updated?.admin_granted_tier))
        await syncDiscordRoleForUser(supabase, resolvedInternalUserId)
        break
      }
      case 'membership.cancel_at_period_end_changed': {
        if (!resolvedInternalUserId || !membershipId) break
        const cancelAtPeriodEnd = data.cancel_at_period_end
        if (typeof cancelAtPeriodEnd !== 'boolean') break
        await supabase
          .from('users')
          .update({
            tier_cancel_at_period_end: cancelAtPeriodEnd,
            tier_status: cancelAtPeriodEnd ? 'canceling' : 'active',
            ...(periodEnd ? { tier_current_period_end: periodEnd } : {}),
          })
          .eq('id', resolvedInternalUserId)
          .eq('whop_membership_id', membershipId)
        break
      }
      default:
        break
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed'
    await finalizeReceipt('failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  await finalizeReceipt(type && ACTIONABLE_EVENT_TYPES.has(type) ? 'succeeded' : 'ignored')
  return NextResponse.json({ received: true })
}
