import { NextResponse } from 'next/server'
import { applePushConfig, type ApplePushConfig } from '@/lib/applePushConfig'
import { sendAppleGameAlerts } from '@/lib/applePushDelivery'
import { requireCronAuth } from '@/lib/cron-auth'
import { gameAlertEvents, gameAlertScope, nearHomeRunGameAlert, type GameAlertKind } from '@/lib/nativeGameAlerts'
import { gameAlertsEnabled, gameAlertSource } from '@/lib/nativeGameAlertSource'
import { shouldSuppressNotificationDelivery, type NotificationDeliverySettings } from '@/lib/notificationDelivery'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 120

type Subscription = { user_id: string; sport: string; game_id: string; game_date: string; subscribed_at: string } & Record<GameAlertKind, boolean>
type Admin = ReturnType<typeof createAdminClient>

async function subscriptions(admin: Admin, first: string, last: string) {
  const rows: Subscription[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await admin.from('native_game_alert_subscriptions')
      .select('user_id,sport,game_id,game_date,subscribed_at,scoring,major,milestone')
      .gte('game_date', first).lte('game_date', last)
      .order('sport').order('game_id').order('user_id').range(offset, offset + 499)
    if (result.error) throw result.error
    rows.push(...result.data)
    if (result.data.length < 500) return rows
  }
}

async function sendForGame(admin: Admin, rows: Subscription[], configs: ApplePushConfig[]) {
  const sample = rows[0]
  const scope = gameAlertScope(sample.sport, sample.game_id, sample.game_date)
  if (!scope) throw Error('Invalid alert scope')
  const summary = await gameAlertSource(scope)
  if (!summary) return { accepted: 0, failed: 0 }
  const now = Date.now()
  const events = gameAlertEvents(scope, summary, now)
  if (scope.sport === 'mlb') {
    const near = await admin.from('operational_retry_queue').select('payload')
      .eq('provider', 'discord').eq('operation', 'contact_alert_media')
      .filter('payload->event->>gamePk', 'eq', scope.gameId)
      .filter('payload->event->>kind', 'eq', 'near_hr')
      .gte('created_at', new Date(now - 150_000).toISOString()).limit(30)
    if (near.error) throw near.error
    for (const row of near.data) {
      const event = nearHomeRunGameAlert(scope, row.payload?.event, now)
      if (event) events.push(event)
    }
    events.sort((a, b) => a.occurredAt - b.occurredAt)
  }
  if (!events.length) return { accepted: 0, failed: 0 }
  let accepted = 0, failed = 0
  for (let index = 0; index < rows.length; index += 100) {
    const recipients = rows.slice(index, index + 100)
    const ids = recipients.map(row => row.user_id)
    const [devices, users] = await Promise.all([
      admin.from('native_apple_push_devices').select('id,user_id,token,topic,environment')
        .in('user_id', ids).gte('updated_at', new Date(now - 30 * 86_400_000).toISOString()).order('updated_at', { ascending: false }),
      admin.from('users').select('id,notification_delivery_settings').in('id', ids),
    ])
    if (devices.error || users.error) throw devices.error ?? users.error
    const subscribed = new Map(recipients.map(user => [user.user_id, user]))
    const settings = new Map(users.data.map(user => [user.id, user.notification_delivery_settings as NotificationDeliverySettings | null]))
    const deliveries = [...Map.groupBy(devices.data, device => device.user_id)].flatMap(([id, owned]) => {
      const recipient = subscribed.get(id)
      if (!recipient || !settings.has(id) || shouldSuppressNotificationDelivery(settings.get(id), 'game_alert', null, new Date(now))) return []
      return events.filter(event => recipient[event.kind] && Date.parse(recipient.subscribed_at) <= event.occurredAt)
        .flatMap(event => owned.slice(0, 8).map(device => ({ device, userId: id, event })))
    })
    for (const result of await Promise.all(configs.map(config => sendAppleGameAlerts(scope, deliveries, config)))) {
      accepted += result.accepted
      failed += result.failed
    }
  }
  return { accepted, failed }
}

const trackedRun = withPipelineHealth('native-game-alerts', run)

export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized
  if (!gameAlertsEnabled()) return NextResponse.json({ enabled: false })
  return trackedRun(request)
}

async function run() {
  const configs = [applePushConfig('production'), applePushConfig('development')].filter((config): config is ApplePushConfig => config != null)
  if (!configs.length) return NextResponse.json({ error: 'APNs provider is unavailable' }, { status: 503 })
  const admin = createAdminClient()
  const now = new Date()
  const easternDate = (time: Date) => time.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  try {
    const rows = await subscriptions(admin, easternDate(new Date(now.getTime() - 86_400_000)), easternDate(now))
    const games = [...Map.groupBy(rows, row => `${row.sport}:${row.game_id}:${row.game_date}`).values()]
    let accepted = 0, failed = 0, sourceFailures = 0
    for (let offset = 0; offset < games.length; offset += 6) {
      const results = await Promise.allSettled(games.slice(offset, offset + 6).map(group => sendForGame(admin, group, configs)))
      for (const result of results) {
        if (result.status === 'fulfilled') { accepted += result.value.accepted; failed += result.value.failed }
        else sourceFailures++
      }
    }
    const expiration = new Date(now.getTime() - 7 * 86_400_000).toISOString()
    const [expiredDeliveries, expiredSubscriptions] = await Promise.all([
      admin.from('native_game_alert_deliveries').delete().lt('attempted_at', expiration),
      admin.from('native_game_alert_subscriptions').delete().lt('game_date', easternDate(new Date(expiration))),
    ])
    const ok = !failed && !sourceFailures && !expiredDeliveries.error && !expiredSubscriptions.error
    const reason = ok ? undefined : 'Game alerts had unavailable sources, delivery failures, or retention errors'
    return NextResponse.json({ ok, games: games.length, delivered: accepted, failed, sourceFailures, reason }, { status: ok ? 200 : 503 })
  } catch {
    return NextResponse.json({ error: 'Game alerts could not be processed' }, { status: 503 })
  }
}
