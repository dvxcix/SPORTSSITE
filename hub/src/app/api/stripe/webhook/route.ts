import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'

// Stripe requires the raw request body for signature verification — do not
// let Next.js parse it as JSON before we see it.
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  const body = await req.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err: any) {
    return NextResponse.json({ error: `Signature verification failed: ${err.message}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        await supabase
          .from('users')
          .update({
            stripe_connect_onboarded: !!account.details_submitted,
            stripe_connect_charges_enabled: !!account.charges_enabled,
            stripe_connect_payouts_enabled: !!account.payouts_enabled,
          })
          .eq('stripe_account_id', account.id)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const type = sub.metadata?.type
        // current_period_start/end live on the subscription item, not the subscription itself, as of this API version.
        const item = sub.items.data[0]
        const periodStart = item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null
        const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null

        if (type === 'pro_plan' && sub.metadata?.slipsurge_user_id) {
          await supabase
            .from('users')
            .update({ membership_expires_at: sub.status === 'active' ? periodEnd : null })
            .eq('id', sub.metadata.slipsurge_user_id)
        } else if (type === 'creator_subscription' && sub.metadata?.creator_id && sub.metadata?.subscriber_id) {
          await supabase.from('subscriptions').upsert({
            subscriber_id: sub.metadata.subscriber_id,
            creator_id: sub.metadata.creator_id,
            tier_id: sub.metadata.tier_id || null,
            stripe_subscription_id: sub.id,
            status: sub.status,
            current_period_start: periodStart,
            current_period_end: periodEnd,
          }, { onConflict: 'stripe_subscription_id' })
          // "Subscriptions" has had a notification toggle in Settings since
          // this session's notifications work, but nothing ever fired one —
          // a creator got a new paying subscriber with zero signal beyond
          // checking their payouts page. Scoped to .created specifically
          // (not .updated, which also fires on every renewal/status change)
          // so a creator isn't re-notified every billing cycle.
          if (event.type === 'customer.subscription.created') {
            await notify(supabase, {
              userId: sub.metadata.creator_id, actorId: sub.metadata.subscriber_id, type: 'subscription',
              message: 'subscribed to your channel', link: '/creators/payouts',
              targetId: sub.metadata.subscriber_id, targetType: 'user',
            })
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const type = sub.metadata?.type
        if (type === 'pro_plan' && sub.metadata?.slipsurge_user_id) {
          await supabase
            .from('users')
            .update({ membership_expires_at: null })
            .eq('id', sub.metadata.slipsurge_user_id)
        } else {
          await supabase
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('stripe_subscription_id', sub.id)
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const parentSub = invoice.parent?.subscription_details?.subscription
        const subId = typeof parentSub === 'string' ? parentSub : parentSub?.id
        if (!subId) break
        const sub = await stripe.subscriptions.retrieve(subId)
        if (sub.metadata?.type === 'creator_subscription' && sub.metadata?.creator_id) {
          const feePct = sub.application_fee_percent ?? 10
          const gross = (invoice.total ?? 0) / 100
          const platformFeeAmount = Math.round(gross * feePct) / 100
          await supabase.from('creator_payouts').insert({
            creator_id: sub.metadata.creator_id,
            source: 'independent_subscription',
            gross_amount: gross,
            platform_fee_pct: feePct,
            platform_fee_amount: platformFeeAmount,
            creator_amount: gross - platformFeeAmount,
            stripe_invoice_id: invoice.id ?? null,
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        // Access is already revoked by the customer.subscription.updated event
        // Stripe fires alongside this (status flips to past_due/unpaid). This
        // case exists only so failed payments show up in server logs instead
        // of silently vanishing — there's no admin UI surfacing this yet.
        const invoice = event.data.object as Stripe.Invoice
        console.warn('Stripe invoice payment failed', invoice.id, invoice.customer)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        // charge.invoice is still sent on the wire but untyped in this stripe-node
        // version (same drift as invoice.parent above) — cast through unknown.
        const chargeInvoice = (charge as unknown as { invoice?: string | { id: string } }).invoice
        const invoiceId = typeof chargeInvoice === 'string' ? chargeInvoice : chargeInvoice?.id
        if (!invoiceId) break
        await supabase
          .from('creator_payouts')
          .update({ status: 'refunded' })
          .eq('stripe_invoice_id', invoiceId)
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id
        if (!chargeId) break
        const charge = await stripe.charges.retrieve(chargeId)
        const chargeInvoice = (charge as unknown as { invoice?: string | { id: string } }).invoice
        const invoiceId = typeof chargeInvoice === 'string' ? chargeInvoice : chargeInvoice?.id
        if (invoiceId) {
          await supabase
            .from('creator_payouts')
            .update({ status: 'disputed' })
            .eq('stripe_invoice_id', invoiceId)
        }
        console.warn('Stripe dispute created', dispute.id, chargeId)
        break
      }

      case 'account.application.deauthorized': {
        // event.account is the connected account that revoked platform access.
        const accountId = (event as any).account as string | undefined
        if (!accountId) break
        await supabase
          .from('users')
          .update({
            stripe_connect_charges_enabled: false,
            stripe_connect_payouts_enabled: false,
          })
          .eq('stripe_account_id', accountId)
        break
      }

      default:
        break
    }
  } catch (err: any) {
    console.error('Stripe webhook handler error', event.type, err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
