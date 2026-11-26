import { NextResponse } from 'next/server'
import { applePushConfig } from '@/lib/applePushConfig'
import { gameAlertScope } from '@/lib/nativeGameAlerts'
import { gameAlertsEnabled, gameAlertSource } from '@/lib/nativeGameAlertSource'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const respond = (value: unknown, status = 200) => NextResponse.json(value, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})
const off = { scoring: false, major: false, milestone: false }

async function handle(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (!gameAlertsEnabled()) return respond({ available: false, ...off })
  const query = new URL(request.url).searchParams
  const scope = gameAlertScope(query.get('sport') ?? '', query.get('game') ?? '', query.get('date') ?? '')
  if (!scope) return respond({ error: 'Choose a valid game' }, 400)
  const admin = createAdminClient()
  const key = { user_id: account.userId, sport: scope.sport, game_id: scope.gameId }
  const selection = 'scoring, major, milestone'
  if (request.method === 'GET') {
    const result = await admin.from('native_game_alert_subscriptions').select(selection).match(key).maybeSingle()
    return result.error ? respond({ error: 'Game alerts could not load' }, 503) : respond({ available: true, ...(result.data ?? off) })
  }
  const limit = await consumeServerRateLimit(account.userId, 'native_game_alert_preferences', 30, 60)
  if (!limit.available) return respond({ error: 'Game alerts are temporarily unavailable' }, 503)
  if (!limit.allowed) return respond({ error: 'Please wait before trying again' }, 429)
  let input: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 300) throw Error()
    input = JSON.parse(raw)
    if (!input || typeof input.scoring !== 'boolean' || typeof input.major !== 'boolean' || typeof input.milestone !== 'boolean') throw Error()
  } catch {
    return respond({ error: 'Choose valid game alerts' }, 400)
  }
  const preferences = { scoring: input.scoring, major: input.major, milestone: input.milestone }
  if (!Object.values(preferences).some(Boolean)) {
    const result = await admin.from('native_game_alert_subscriptions').delete().match(key)
    return result.error ? respond({ error: 'Game alerts could not be turned off' }, 503) : respond({ available: true, ...off })
  }
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: devices, error } = await admin.from('native_apple_push_devices').select('environment,topic')
    .eq('user_id', account.userId).gte('updated_at', since).limit(8)
  if (error) return respond({ error: 'Device registration could not be checked' }, 503)
  const configs = [applePushConfig('production'), applePushConfig('development')]
  if (!devices?.some(device => configs.some(config => config?.environment === device.environment && config?.topic === device.topic))) {
    return respond({ error: 'Enable notifications on this device first' }, 409)
  }
  const day = Date.parse(scope.date + 'T12:00:00Z')
  if (Math.abs(Date.now() - day) > 4 * 86_400_000) return respond({ error: 'Alerts are available for upcoming and live games' }, 409)
  const source = await gameAlertSource(scope, true).catch(() => null)
  const state = source?.header?.competitions?.[0]?.status?.type
  if (source?.header?.id !== scope.gameId || !state || !['pre', 'in'].includes(state.state) ||
    /cancel|postpon|abandon/i.test(state.shortDetail)) {
    return respond({ error: 'This game cannot receive live alerts' }, 409)
  }
  const result = await admin.from('native_game_alert_subscriptions')
    .upsert({ ...key, ...preferences, game_date: scope.date, subscribed_at: new Date().toISOString() })
  return result.error ? respond({ error: 'Game alerts could not be saved' }, 503) : respond({ available: true, ...preferences })
}

export const GET = handle
export const PUT = handle
