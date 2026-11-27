import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { storeKitMembership } from '@/lib/storeKitEntitlements'
import { readSignedStoreKitBody, redeemStoreKitTransaction, storeKitError } from '@/lib/storeKitSignedData'

export const runtime = 'nodejs'
const respond = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const rate = await consumeServerRateLimit(account.userId, 'native_storekit_redeem', 30, 300)
  if (!rate.available) return respond({ error: 'Apple purchase verification is temporarily unavailable' }, 503)
  if (!rate.allowed) return respond({ error: 'Please wait before checking purchases again' }, 429)
  try {
    const signed = await readSignedStoreKitBody(request, 'signedTransaction')
    await redeemStoreKitTransaction(signed, account.userId)
    const membership = await storeKitMembership(account.userId)
    return respond({ active: Boolean(membership) })
  } catch (error) {
    const result = storeKitError(error)
    return respond({ error: result.message }, result.status)
  }
}
