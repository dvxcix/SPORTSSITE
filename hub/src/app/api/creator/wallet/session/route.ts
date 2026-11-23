import { NextRequest, NextResponse } from 'next/server'
import { creatorWalletAuth } from '@/lib/creatorWalletAuth'
import { createCreatorWalletSession } from '@/lib/creatorWalletProvider'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' }
export async function POST(request: NextRequest) {
  // Financial-write credentials only follow a deliberate, same-origin JSON action.
  if (request.headers.get('origin') !== request.nextUrl.origin || !request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Open this action from your SlipSurge dashboard.' }, { status: 403, headers })
  const auth = await creatorWalletAuth()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
  if (auth.testAccount) return NextResponse.json({ error: 'Financial actions are disabled for this test account.' }, { status: 403, headers })
  let body: unknown
  try { const raw = await request.text(); if (raw.length > 256) throw new Error(); body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Choose a valid wallet action.' }, { status: 400, headers }) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('intent' in body) || typeof body.intent !== 'string' || !['withdraw', 'verification'].includes(body.intent)) return NextResponse.json({ error: 'Choose a valid wallet action.' }, { status: 400, headers })
  const limit = await consumeServerRateLimit(auth.userId, 'creator_wallet_session', 8, 600)
  if (!limit.available || !limit.allowed) return NextResponse.json({ error: 'Please wait before opening another secure session.' }, { status: limit.available ? 429 : 503, headers })
  try { return NextResponse.json(await createCreatorWalletSession(auth.accountId, body.intent as 'withdraw' | 'verification'), { headers }) }
  catch { return NextResponse.json({ error: 'This action could not be opened. Refresh your account status and try again.' }, { status: 502, headers }) }
}
