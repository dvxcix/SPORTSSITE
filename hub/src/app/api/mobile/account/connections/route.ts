import { NextResponse } from 'next/server'
import { accountSettingsActor } from '@/lib/supabase/accountSettingsActor'
import { createAdminClient } from '@/lib/supabase/admin'
import { isNativeAuthValue, nativeHandoffKey } from '@/lib/nativeAuthHandoff'
import { nativeOAuthOrigin } from '@/lib/nativeOAuth'
import { readWhopLinkProof, sealWhopLink } from '@/lib/nativeWhopLink'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { extractIdentityHandle, type VerifiedIdentity } from '@/lib/verifiedIdentity'
import { applyWhopConnection } from '@/lib/whopConnection'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return respond({ error: 'Sign in required' }, 401)
  const account = await accountSettingsActor(request)
  if (account.error) return account.error

  const { data, error } = await createAdminClient().from('users').select('whop_user_id, verified_identities').eq('id', account.user.id).maybeSingle()
  if (error || !data) return respond({ error: 'Connections could not be loaded' }, 503)

  const records = account.user.identities ?? []
  const whop = (data.verified_identities as Record<string, VerifiedIdentity> | null)?.whop
  return respond({ connections: (['whop', 'discord', 'x'] as const).map(provider => {
    if (provider === 'whop') return { provider, connected: Boolean(data.whop_user_id), identity: data.whop_user_id ? whop ?? null : null, canDisconnect: Boolean(data.whop_user_id) }
    const info = records.find(identity => identity.provider === provider)
    return { provider, connected: Boolean(info), identity: info ? extractIdentityHandle(provider, info.identity_data ?? {}) : null, canDisconnect: Boolean(info) && records.length > 1 }
  }) })
}

export async function POST(request: Request) {
  if (!request.headers.has('authorization')) return respond({ error: 'Sign in required' }, 401)
  const account = await accountSettingsActor(request)
  if (account.error) return account.error
  const raw = await request.text().catch(() => '')
  if (raw.length > 4096) return respond({ error: 'Invalid connection attempt' }, 400)
  let input: Record<string, unknown>
  try {
    input = JSON.parse(raw)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error()
  } catch { return respond({ error: 'Invalid connection attempt' }, 400) }

  const key = nativeHandoffKey(), userId = account.user.id
  if (!key) return respond({ error: 'Whop connection unavailable' }, 503)
  if (input.action === 'whop-start' && isNativeAuthValue(input.state) && isNativeAuthValue(input.challenge)) {
    const rate = await consumeServerRateLimit(userId, 'native_whop_connection', 8, 15 * 60)
    if (!rate.available) return respond({ error: 'Whop connection unavailable' }, 503)
    if (!rate.allowed) return respond({ error: 'Try again later' }, 429)
    const url = new URL('/auth/whop/login', nativeOAuthOrigin)
    url.searchParams.set('native_link', sealWhopLink(key, 'request', { userId, state: input.state, challenge: input.challenge }))
    return respond({ url: url.href })
  }

  if (input.action === 'whop-finish') {
    const proof = readWhopLinkProof(key, input.proof, { userId, state: input.state, verifier: input.verifier })
    if (!proof) return respond({ error: 'Whop connection could not be verified' }, 400)
    const error = await applyWhopConnection(createAdminClient(), userId, proof.whop, proof.discordAccess)
    if (error) return respond({ error: 'Whop account could not be connected', code: error }, error === 'already_linked_elsewhere' ? 409 : 503)
    return respond({ ok: true })
  }
  return respond({ error: 'Invalid connection attempt' }, 400)
}
