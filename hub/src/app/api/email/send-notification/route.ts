import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SETTINGS_KEY_BY_TYPE, type NotificationType } from '@/lib/notify'
import { hasBearerSecret } from '@/lib/requestAuth'
import { safeInternalPath } from '@/lib/safeRedirect'
import { brandedEmailHtml } from '@/lib/email'

export const revalidate = 0

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]!)
}

// Reuses the same secret as /api/push/send — both routes are called the
// same way (a Postgres trigger on notifications insert, see the
// notifications_email_trigger migration), so there's no reason to make the
// user set up a second one.
function requireWebhookAuth(req: Request): NextResponse | null {
  const secret = process.env.PUSH_TRIGGER_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PUSH_TRIGGER_SECRET is not configured — refusing to run an unauthenticated email send' }, { status: 500 })
  }
  if (!hasBearerSecret(req, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Email is opt-IN per notification type (default off — see
// NotificationSettingsForm), unlike push which is opt-out. Most people
// don't want their inbox flooded with every reaction/comment; someone who
// explicitly turns email on for a type has said they want it.
export async function POST(request: Request) {
  const authError = requireWebhookAuth(request)
  if (authError) return authError

  const apiKey = process.env.EMAIL_RESEND_API_KEY || process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, skipped: 'Resend API key not configured' })
  const fromDomain = process.env.EMAIL_RESEND_EMAIL_DOMAIN || process.env.RESEND_EMAIL_DOMAIN || 'slipsurge.com'

  const body = await request.json().catch(() => null)
  const notificationId = body?.notification_id as string | undefined
  if (!notificationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
    return NextResponse.json({ error: 'Malformed notification_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  async function recordDelivery(status: 'sent' | 'failed' | 'skipped', details?: { providerStatus?: number | null; error?: string | null; userId?: string | null; notificationId?: string | null }) {
    const { error } = await admin.from('notification_delivery_attempts').insert({
      notification_id: details?.notificationId === undefined ? notificationId : details.notificationId,
      user_id: details?.userId ?? null,
      channel: 'email',
      status,
      provider_status: details?.providerStatus ?? null,
      error: details?.error?.slice(0, 1000) ?? null,
    })
    if (error) console.error('[email/send-notification] could not record delivery telemetry', { code: error.code })
  }

  const { data: notification } = await admin
    .from('notifications')
    .select('id, user_id, type, message, link, data, actor:users!notifications_actor_id_fkey(username, display_name)')
    .eq('id', notificationId)
    .maybeSingle()
  if (!notification) {
    await recordDelivery('skipped', { notificationId: null, error: 'notification not found' })
    return NextResponse.json({ ok: true, skipped: 'notification not found' })
  }

  const { data: recipient } = await admin
    .from('users')
    .select('email, notification_settings')
    .eq('id', notification.user_id)
    .maybeSingle()
  if (!recipient?.email) {
    await recordDelivery('skipped', { userId: notification.user_id, error: 'no recipient email' })
    return NextResponse.json({ ok: true, skipped: 'no recipient email' })
  }

  const settings = (recipient.notification_settings as Record<string, boolean> | null) ?? {}
  const settingsKey = SETTINGS_KEY_BY_TYPE[notification.type as NotificationType]
  // Must be explicitly `true` — undefined/missing/false all mean "off",
  // opposite default from push.
  if (!settingsKey || settings[`${settingsKey}_email`] !== true) {
    await recordDelivery('skipped', { userId: notification.user_id, error: 'email disabled for notification type' })
    return NextResponse.json({ ok: true, skipped: 'email disabled for this notification type' })
  }

  const { count: alreadySent } = await admin
    .from('notification_delivery_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('notification_id', notification.id)
    .eq('channel', 'email')
    .eq('status', 'sent')
  if ((alreadySent ?? 0) > 0) {
    return NextResponse.json({ ok: true, skipped: 'email already delivered' })
  }

  const actor = notification.actor as any
  const actorName = actor?.display_name || actor?.username
  const text = (actorName ? `${actorName} ` : '') + (notification.message || 'sent you a notification')
  const url = `https://www.slipsurge.com${safeInternalPath(notification.link, '/notifications')}`
  // Same rich image NotificationsList/push already show (player headshot,
  // team logo — see notifications.data) — omitted entirely when absent,
  // same as every notification type before this.
  const richImage = (notification.data as any)?.avatar_url as string | undefined
  const safeText = escapeHtml(text)
  const safeUrl = escapeHtml(url)
  const safeRichImage = richImage?.startsWith('https://') ? escapeHtml(richImage) : undefined

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `SlipSurge <team@${fromDomain}>`,
        to: [recipient.email],
        subject: text,
        text: `${text}\n\n${url}\n\nManage which notifications email you: https://www.slipsurge.com/settings/notifications`,
        html: brandedEmailHtml({
          eyebrow: 'New notification',
          heading: 'Something new on SlipSurge',
          preheader: text,
          bodyHtml: `${safeRichImage ? (
  notification.type === 'lineup_confirmed'
    // object-fit is unreliable across email clients (Outlook ignores it
    // outright), and a team logo cropped to fill a circle via cover just
    // zooms into the artwork — sizing the <img> itself SMALLER than its
    // circular cell, so the logo sits centered with natural whitespace
    // around it, works everywhere without depending on object-fit at all.
    ? `<table role="presentation" width="56" height="56" cellpadding="0" cellspacing="0" style="margin:0 auto 14px;border-radius:50%;background:#1A1D24;"><tr><td align="center" valign="middle"><img src="${safeRichImage}" width="36" style="display:block;" alt="" /></td></tr></table>`
    : `<img src="${safeRichImage}" width="56" height="56" style="display:block;margin:0 auto 14px;border-radius:50%;object-fit:cover;" alt="" />`
) : ''}<p style="margin:0;font-size:15px;line-height:1.6;color:#F5F5F5;">${safeText}</p>`,
          ctaLabel: 'View on SlipSurge',
          ctaUrl: safeUrl,
          footerHtml: '<a href="https://www.slipsurge.com/settings/notifications" style="font-size:11px;color:#7D8796;text-decoration:underline;">Manage notification emails</a>',
        }),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('[email/send-notification] Resend send failed', { status: res.status })
      await recordDelivery('failed', { userId: notification.user_id, providerStatus: res.status, error: 'provider rejected request' })
      return NextResponse.json({ ok: false, error: 'Email provider rejected the notification' }, { status: 502 })
    }
    await recordDelivery('sent', { userId: notification.user_id, providerStatus: res.status })
  } catch (e) {
    console.error('[email/send-notification] request failed', { type: e instanceof Error ? e.name : typeof e })
    await recordDelivery('failed', { userId: notification.user_id, error: 'delivery request failed' })
    return NextResponse.json({ ok: false, error: 'Email delivery failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
