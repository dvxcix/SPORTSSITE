import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type ResendEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    to?: string[]
    tags?: Record<string, string> | null
    bounce?: { message?: string; type?: string; subType?: string }
    error?: { message?: string } | string
  }
}

const FAILURE_EVENTS = new Set(['email.bounced', 'email.complained', 'email.failed', 'email.suppressed'])
const FINAL_EVENTS = new Set([...FAILURE_EVENTS, 'email.delivered', 'email.sent', 'email.delivery_delayed'])
const SUPPRESSION_EVENTS = new Set(['email.bounced', 'email.complained', 'email.suppressed'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function eventError(event: ResendEvent) {
  if (event.data?.bounce?.message) return event.data.bounce.message.slice(0, 1000)
  if (typeof event.data?.error === 'string') return event.data.error.slice(0, 1000)
  if (event.data?.error?.message) return event.data.error.message.slice(0, 1000)
  return FAILURE_EVENTS.has(event.type || '') ? `Provider reported ${event.type}` : null
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const id = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signature = request.headers.get('svix-signature')
  if (!secret || !id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  const rawBody = await request.text()
  let event: ResendEvent
  try {
    event = new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    }) as ResendEvent
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing, error: receiptLookupError } = await admin
    .from('provider_webhook_events')
    .select('id,status,updated_at,attempt_count')
    .eq('provider', 'resend')
    .eq('provider_event_id', id)
    .maybeSingle()
  if (receiptLookupError) return NextResponse.json({ error: 'Webhook receipt lookup failed' }, { status: 500 })

  if (existing?.status === 'succeeded' || existing?.status === 'ignored') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (existing?.status === 'processing' && Date.now() - new Date(existing.updated_at).getTime() < 10 * 60_000) {
    // A concurrent handler may still fail; a 2xx here would stop redelivery.
    return NextResponse.json({ error: 'Webhook event is still processing' }, { status: 503 })
  }
  if (existing) {
    const { error } = await admin.from('provider_webhook_events').update({
      event_type: event.type ?? null,
      status: 'processing',
      attempt_count: Number(existing.attempt_count || 1) + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
    if (error) return NextResponse.json({ error: 'Webhook receipt could not be updated' }, { status: 500 })
  } else {
    const { error } = await admin.from('provider_webhook_events').insert({
      provider: 'resend',
      provider_event_id: id,
      event_type: event.type ?? null,
    })
    // A concurrent insert does not establish that processing succeeded.
    if (error?.code === '23505') return NextResponse.json({ error: 'Webhook event is still processing' }, { status: 503 })
    if (error) return NextResponse.json({ error: 'Webhook receipt could not be recorded' }, { status: 500 })
  }

  async function finalize(status: 'succeeded' | 'failed' | 'ignored', error?: string) {
    const { error: receiptError } = await admin.from('provider_webhook_events').update({
      status,
      last_error: error?.slice(0, 2000) ?? null,
      processed_at: status === 'failed' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('provider', 'resend').eq('provider_event_id', id)
    if (receiptError) throw new Error('Webhook receipt could not be finalized')
  }

  try {
    const eventType = event.type || ''
    const providerMessageId = event.data?.email_id
    if (!providerMessageId || !FINAL_EVENTS.has(eventType)) {
      await finalize('ignored')
      return NextResponse.json({ received: true, ignored: true })
    }

    const { data: attempt, error: attemptError } = await admin
      .from('notification_delivery_attempts')
      .select('id,user_id')
      .eq('channel', 'email')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle()
    if (attemptError) throw attemptError
    let recipientUserId: string | null = attempt?.user_id ?? null
    if (!attempt) {
      const notificationId = event.data?.tags?.notification_id
      if (event.data?.tags?.category === 'member_notification' && typeof notificationId === 'string' && UUID.test(notificationId)) {
        const { data: notification, error: notificationError } = await admin.from('notifications')
          .select('user_id').eq('id', notificationId).maybeSingle()
        if (notificationError || !notification?.user_id) throw new Error('Notification delivery receipt is not ready')
        recipientUserId = notification.user_id
      } else if (event.data?.tags?.category === 'member_notification') {
        throw new Error('Notification delivery receipt is not ready')
      } else {
      // Other messages share this webhook. Do not claim an unmatched event
      // was processed; older untagged notification events need manual review.
        await finalize('ignored')
        return NextResponse.json({ received: true, ignored: true })
      }
    }

    if (attempt) {
      const failed = FAILURE_EVENTS.has(eventType)
      const { error } = await admin.from('notification_delivery_attempts').update({
        status: failed ? 'failed' : 'sent',
        provider_event: eventType,
        provider_event_at: event.created_at || new Date().toISOString(),
        error: eventError(event),
      }).eq('id', attempt.id)
      if (error) throw error

    }

    if (SUPPRESSION_EVENTS.has(eventType)) {
      if (!recipientUserId || !Array.isArray(event.data?.to) || event.data.to.length !== 1 || typeof event.data.to[0] !== 'string') throw new Error('Notification recipient is not ready')
      // The function compares the signed event's recipient while holding the
      // account row lock, so an old address cannot suppress a changed address.
      const { data: suppressed, error: suppressionError } = await admin.rpc('suppress_account_notification_email', { p_user_id: recipientUserId, p_event_id: id, p_expected_email: event.data.to[0] })
      if (suppressionError || (suppressed !== 'suppressed' && suppressed !== 'address_changed')) throw new Error('Notification email suppression could not be saved')
      if (suppressed === 'address_changed') {
        await finalize('ignored')
        return NextResponse.json({ received: true, ignored: true })
      }
    }

    await finalize('succeeded')
    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resend webhook processing failed'
    try { await finalize('failed', message) } catch { /* A failed receipt must not be acknowledged. */ }
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
