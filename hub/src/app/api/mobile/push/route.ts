import { NextResponse } from 'next/server'
import { applePushConfig, appleToken, isAppleEnvironment } from '@/lib/applePushConfig'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (value: unknown, status = 200) => NextResponse.json(value, { status, headers })

async function register(request: Request, remove: boolean) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  let input: { token?: unknown; environment?: unknown; topic?: unknown } | null
  try {
    if (Number(request.headers.get('content-length')) > 2048) return respond({ error: 'Invalid registration' }, 400)
    const raw = await request.text()
    if (raw.length > 2048) return respond({ error: 'Invalid registration' }, 400)
    input = JSON.parse(raw)
  } catch {
    return respond({ error: 'Invalid registration' }, 400)
  }
  if (!appleToken(input?.token) || !isAppleEnvironment(input?.environment)) return respond({ error: 'Invalid registration' }, 400)
  const config = applePushConfig(input.environment)
  if (!config) return respond({ error: 'Device alerts are temporarily unavailable' }, 503)
  if (input.topic !== config.topic) return respond({ error: 'This app cannot register for alerts' }, 403)
  const device = { token: input.token, topic: config.topic, environment: config.environment }
  const table = createAdminClient().from('native_apple_push_devices')
  if (remove) {
    const result = await table.delete().match({ ...device, user_id: account.userId })
    return result.error ? respond({ error: 'Device registration could not be removed' }, 503) : respond({ ok: true })
  }
  const rate = await consumeServerRateLimit(account.userId, 'native_apple_push_register', 18, 3600)
  if (!rate.available) return respond({ error: 'Device alerts are temporarily unavailable' }, 503)
  if (!rate.allowed) return respond({ error: 'Please wait before trying again' }, 429)
  const result = await table.upsert({ ...device, user_id: account.userId, updated_at: new Date().toISOString() },
    { onConflict: 'environment,topic,token' })
  return result.error ? respond({ error: 'Device registration could not be saved' }, 503) : respond({ ok: true })
}

export async function POST(request: Request) { return register(request, false) }
export async function DELETE(request: Request) { return register(request, true) }
