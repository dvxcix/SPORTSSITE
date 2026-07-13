import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SETTINGS_KEY_BY_TYPE, type NotificationType } from '@/lib/notify'

export const revalidate = 0

// Reuses the same secret as /api/push/send — both routes are called the
// same way (a Postgres trigger on notifications insert, see the
// notifications_email_trigger migration), so there's no reason to make the
// user set up a second one.
function requireWebhookAuth(req: Request): NextResponse | null {
  const secret = process.env.PUSH_TRIGGER_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PUSH_TRIGGER_SECRET is not configured — refusing to run an unauthenticated email send' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
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

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, skipped: 'RESEND_API_KEY not configured' })

  const body = await request.json().catch(() => null)
  const notificationId = body?.notification_id as string | undefined
  if (!notificationId) return NextResponse.json({ error: 'Missing notification_id' }, { status: 400 })

  const admin = createAdminClient()

  const { data: notification } = await admin
    .from('notifications')
    .select('id, user_id, type, message, link, actor:users!notifications_actor_id_fkey(username, display_name)')
    .eq('id', notificationId)
    .maybeSingle()
  if (!notification) return NextResponse.json({ ok: true, skipped: 'notification not found' })

  const { data: recipient } = await admin
    .from('users')
    .select('email, notification_settings')
    .eq('id', notification.user_id)
    .maybeSingle()
  if (!recipient?.email) return NextResponse.json({ ok: true, skipped: 'no recipient email' })

  const settings = (recipient.notification_settings as Record<string, boolean> | null) ?? {}
  const settingsKey = SETTINGS_KEY_BY_TYPE[notification.type as NotificationType]
  // Must be explicitly `true` — undefined/missing/false all mean "off",
  // opposite default from push.
  if (!settingsKey || settings[`${settingsKey}_email`] !== true) {
    return NextResponse.json({ ok: true, skipped: 'email disabled for this notification type' })
  }

  const actor = notification.actor as any
  const actorName = actor?.display_name || actor?.username
  const text = (actorName ? `${actorName} ` : '') + (notification.message || 'sent you a notification')
  const url = notification.link ? `https://www.slipsurge.com${notification.link}` : 'https://www.slipsurge.com/notifications'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SlipSurge <team@slipsurge.com>',
        to: [recipient.email],
        subject: text,
        text: `${text}\n\n${url}\n\nManage which notifications email you: https://www.slipsurge.com/settings/notifications`,
        html: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#06070A;padding:40px 0;font-family:-apple-system,Segoe UI,sans-serif;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#0B0D12;border:1px solid #1A1D24;border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px 32px 0;text-align:center;">
<img src="https://www.slipsurge.com/logo.png" width="40" height="40" style="display:block;margin:0 auto 12px;" alt="SlipSurge" />
<div style="font-size:18px;font-weight:900;color:#F5F5F5;letter-spacing:-0.02em;">Slip<span style="color:#B4FF4D;">Surge</span></div>
</td></tr>
<tr><td style="padding:28px 32px 8px;text-align:center;">
<p style="margin:0;font-size:15px;line-height:1.6;color:#F5F5F5;">${text}</p>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center;">
<a href="${url}" style="display:inline-block;background:#B4FF4D;color:#0B1600;font-weight:800;font-size:14px;padding:12px 32px;border-radius:99px;text-decoration:none;">View on SlipSurge</a>
</td></tr>
<tr><td style="padding:0 32px 28px;text-align:center;">
<a href="https://www.slipsurge.com/settings/notifications" style="font-size:12px;color:#6B7280;text-decoration:underline;">Manage notification emails</a>
</td></tr>
</table>
</td></tr>
</table>`,
      }),
    })
    if (!res.ok) console.error('[email/send-notification] Resend send failed', await res.text())
  } catch (e) {
    console.error('[email/send-notification] threw', e)
  }

  return NextResponse.json({ ok: true })
}
