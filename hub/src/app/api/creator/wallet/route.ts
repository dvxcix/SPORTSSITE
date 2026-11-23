import { NextRequest, NextResponse } from 'next/server'
import { creatorWalletAuth } from '@/lib/creatorWalletAuth'
import { readCreatorWallet } from '@/lib/creatorWalletProvider'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' }
export async function GET(request: NextRequest) {
  const auth = await creatorWalletAuth()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
  const query = request.nextUrl.searchParams, after = query.get('after')
  if ([...query.keys()].some(key => key !== 'after') || query.getAll('after').length > 1 || after !== null && (!after.length || after.length > 512)) return NextResponse.json({ error: 'Invalid payout page.' }, { status: 400, headers })
  const limit = await consumeServerRateLimit(auth.userId, 'creator_wallet_read', 40, 60)
  if (!limit.available || !limit.allowed) return NextResponse.json({ error: 'Please wait a moment before refreshing.' }, { status: limit.available ? 429 : 503, headers })
  try { return NextResponse.json(await readCreatorWallet(auth.accountId, after), { headers }) }
  catch { return NextResponse.json({ error: 'Your balance is temporarily unavailable. Try refreshing.' }, { status: 502, headers }) }
}
