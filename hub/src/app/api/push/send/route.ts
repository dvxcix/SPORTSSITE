import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0

function requirePushAuth(req: Request): NextResponse | null {
  const secret = process.env.PUSH_TRIGGER_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PUSH_TRIGGER_SECRET is not configured — refusing to run an unauthenticated push send' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Called by the `notifications_push_trigger` Postgres trigger (see the
// add_push_subscriptions_and_webhook migration) on every new notification
// row, regardless of whether it was inserted by a client component or a
// server route — this is the one place push delivery needs to live.
export async function POST(request: Request) {
  const authError = requirePushAuth(request)
  if (authError) return authError

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys are not configured' }, { status: 500 })
  }
  webpush.setVapidDetails('mailto:support@slipsurge.com', publicKey, privateKey)

  const body = await request.json().catch(() => null)
  const notificationId = body?.notification_id as string | undefined
  if (!notificationId) return NextResponse.json({ error: 'Missing notification_id' }, { status: 400 })

  const admin = createAdminClient()

  const { data: notification } = await admin
    .from('notifications')
    .select('id, user_id, type, message, link, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url)')
    .eq('id', notificationId)
    .maybeSingle()
  if (!notification) return NextResponse.json({ ok: true, skipped: 'notification not found' })

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', notification.user_id)
  if (!subscriptions?.length) return NextResponse.json({ ok: true, skipped: 'no push subscriptions' })

  const actor = notification.actor as any
  const actorName = actor?.display_name || actor?.username
  const payload = JSON.stringify({
    title: 'SlipSurge',
    body: (actorName ? `${actorName} ` : '') + (notification.message || 'sent you a notification'),
    icon: '/icon-192.png',
    url: notification.link || '/notifications',
  })

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(err => {
        // 404/410 means the browser revoked or expired this subscription —
        // stale rows would otherwise accumulate forever and get retried on
        // every future notification.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          return admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
        throw err
      })
    )
  )

  return NextResponse.json({ ok: true, sent: results.filter(r => r.status === 'fulfilled').length })
}
