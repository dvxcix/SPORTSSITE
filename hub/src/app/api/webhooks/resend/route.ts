import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { SETTINGS_KEY_BY_TYPE } from '@/lib/notify'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type ResendEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    bounce?: { message?: string; type?: string; subType?: string }
    error?: { message?: string } | string
  }
}

const FAILURE_EVENTS = new Set(['email.bounced', 'email.complained', 'email.failed', 'email.suppressed'])
const FINAL_EVENTS = new Set([...FAILURE_EVENTS, 'email.delivered', 'email.sent', 'email.delivery_delayed'])

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
  const { data: existing } = await admin
    .from('provider_webhook_events')
    .select('id,status,updated_at,attempt_count')
    .eq('provider', 'resend')
    .eq('provider_event_id', id)
    .maybeSingle()

  if (existing?.status === 'succeeded' || existing?.status === 'ignored') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (existing?.status === 'processing' && Date.now() - new Date(existing.updated_at).getTime() < 10 * 60_000) {
    return NextResponse.json({ received: true, processing: true })
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
    if (error?.code === '23505') return NextResponse.json({ received: true, duplicate: true })
    if (error) return NextResponse.json({ error: 'Webhook receipt could not be recorded' }, { status: 500 })
  }

  async function finalize(status: 'succeeded' | 'failed' | 'ignored', error?: string) {
    await admin.from('provider_webhook_events').update({
      status,
      last_error: error?.slice(0, 2000) ?? null,
      processed_at: status === 'failed' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('provider', 'resend').eq('provider_event_id', id)
  }

  try {
    const eventType = event.type || ''
    const providerMessageId = event.data?.email_id
    if (!providerMessageId || !FINAL_EVENTS.has(eventType)) {
      await finalize('ignored')
      return NextResponse.json({ received: true, ignored: true })
    }

    const { data: attempt } = await admin
      .from('notification_delivery_attempts')
      .select('id,user_id')
      .eq('channel', 'email')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle()

    if (attempt) {
      const failed = FAILURE_EVENTS.has(eventType)
      const { error } = await admin.from('notification_delivery_attempts').update({
        status: failed ? 'failed' : 'sent',
        provider_event: eventType,
        provider_event_at: event.created_at || new Date().toISOString(),
        error: eventError(event),
      }).eq('id', attempt.id)
      if (error) throw error

      // A permanent bounce, suppression, or spam complaint should stop all
      // optional notification-email categories for that member. In-app and
      // push preferences remain untouched, as do security/billing emails.
      if (attempt.user_id && ['email.bounced', 'email.complained', 'email.suppressed'].includes(eventType)) {
        const { data: recipient } = await admin.from('users').select('notification_settings').eq('id', attempt.user_id).maybeSingle()
        const settings = { ...((recipient?.notification_settings as Record<string, boolean> | null) ?? {}) }
        for (const key of new Set(Object.values(SETTINGS_KEY_BY_TYPE))) settings[`${key}_email`] = false
        await admin.from('users').update({ notification_settings: settings }).eq('id', attempt.user_id)
      }
    }

    await finalize('succeeded')
    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resend webhook processing failed'
    await finalize('failed', message)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
