import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { reconcileWhopAddon } from '@/lib/whopAddonReconcile'

export const revalidate = 0

// Safety net for the addon Whop business's webhook, which was never
// registered in that business's dashboard (confirmed live: zero deliveries
// ever to /api/webhooks/whop-addon despite real completed $10 add-on
// checkouts — two customers paid and got nothing until this was caught and
// backfilled by hand). Runs hourly (see vercel.json) rather than on every
// checkout, since it's polling Whop's own undocumented company-level
// memberships endpoint — an hour of lag on a $10 upsell is an acceptable
// trade against hammering an API that already 400'd on two path guesses
// before the one this code settled on. Registering the real webhook is
// still the fix for instant grants; this only exists because that hasn't
// happened yet and shouldn't be the only thing standing between a customer
// paying and getting what they paid for.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const result = await reconcileWhopAddon()
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result)
}
