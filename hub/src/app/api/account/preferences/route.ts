import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
const notificationKeys = new Set(['new_follower', 'post_reaction', 'post_comment', 'repost', 'mention', 'new_pick', 'pick_result', 'group_invite', 'dm', 'subscription', 'lineup_confirmed'].flatMap(key => [key, `${key}_email`]))
const objectValue = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const stringList = (value: unknown) => Array.isArray(value) && value.length <= 300 && value.every(item => typeof item === 'string' && item.length <= 120)

async function limitedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing body')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 16384) { await reader.cancel(); throw new Error('Body too large') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveAuthedClient()
  if (authError) return authError
  if (!userId) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers })
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if ((origin && origin !== new URL(request.url).origin) || (site && !['same-origin', 'none'].includes(site))) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403, headers })
  let body: unknown
  try { body = await limitedJson(request) } catch { return NextResponse.json({ error: 'Invalid preferences.' }, { status: 400, headers }) }
  if (!objectValue(body) || Object.keys(body).some(key => !['kind', 'value', 'expected'].includes(key)) || !objectValue(body.value) || !objectValue(body.expected)) return NextResponse.json({ error: 'Invalid preferences.' }, { status: 400, headers })

  const value = body.value
  let fields: string[]
  let update: Record<string, Record<string, unknown>>
  if (body.kind === 'interests') {
    if (Object.keys(value).some(key => !['content_mix', 'market_focus', 'discovery_mode'].includes(key)) || !stringList(value.content_mix) || !stringList(value.market_focus) || !['balanced', 'following', 'live'].includes(String(value.discovery_mode))) return NextResponse.json({ error: 'Invalid interests.' }, { status: 400, headers })
    fields = ['interest_settings']
    update = { interest_settings: value }
  } else if (body.kind === 'notifications') {
    if (!objectValue(value.settings) || !objectValue(value.delivery) || Object.keys(value).some(key => !['settings', 'delivery'].includes(key)) || Object.entries(value.settings).some(([key, item]) => !notificationKeys.has(key) || typeof item !== 'boolean')) return NextResponse.json({ error: 'Invalid notifications.' }, { status: 400, headers })
    const delivery = value.delivery
    if (Object.keys(delivery).some(key => !['quiet_hours_enabled', 'quiet_start', 'quiet_end', 'timezone', 'live_game_priority'].includes(key)) || typeof delivery.quiet_hours_enabled !== 'boolean' || typeof delivery.live_game_priority !== 'boolean' || typeof delivery.timezone !== 'string' || delivery.timezone.length > 100 || typeof delivery.quiet_start !== 'string' || typeof delivery.quiet_end !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(delivery.quiet_start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(delivery.quiet_end)) return NextResponse.json({ error: 'Invalid delivery settings.' }, { status: 400, headers })
    try { new Intl.DateTimeFormat('en', { timeZone: delivery.timezone }) } catch { return NextResponse.json({ error: 'Invalid time zone.' }, { status: 400, headers }) }
    fields = ['notification_settings', 'notification_delivery_settings']
    update = { notification_settings: value.settings, notification_delivery_settings: delivery }
  } else if (body.kind === 'dugout-columns') {
    if (Object.keys(value).some(key => !['hiddenGroups', 'hiddenColumns', 'columnOrder'].includes(key)) || Object.values(value).some(item => !stringList(item))) return NextResponse.json({ error: 'Invalid column settings.' }, { status: 400, headers })
    fields = ['dugout_column_prefs']
    update = { dugout_column_prefs: value }
  } else return NextResponse.json({ error: 'Invalid preferences.' }, { status: 400, headers })
  const expected = body.expected
  if (Object.keys(expected).some(field => !fields.includes(field)) || fields.some(field => !(field in expected))) return NextResponse.json({ error: 'Invalid preference baseline.' }, { status: 400, headers })

  // This function is executable by service_role only. It compares edited
  // keys and merges against the current row in one SQL UPDATE. Do not retry:
  // a failed request may already have reached the database.
  const { data: saved, error } = await createAdminClient().rpc('save_account_preferences', {
    p_user_id: userId, p_kind: body.kind, p_changes: update, p_expected: expected,
  })
  if (error) {
    const response = safeApiError('preferences-save', error, 'Preferences could not be saved.')
    response.headers.set('Cache-Control', headers['Cache-Control'])
    return response
  }
  if (saved !== true) return NextResponse.json({ error: 'Preferences changed while editing. Refresh and try again.' }, { status: 409, headers })
  return NextResponse.json({ ok: true }, { headers })
}
