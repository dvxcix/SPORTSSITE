import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { reconcileWhopMain } from '@/lib/whopMainReconcile'

export const revalidate = 0

// Safety net for the MAIN tier-payments Whop business's webhook
// (/api/webhooks/whop), confirmed live to have never actually been
// received — same root cause and same fix shape as
// /api/cron/whop-addon-reconcile, just across all 5 real Basic/Advanced/
// Ultimate plans instead of the one add-on plan. Runs hourly (vercel.json).
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const result = await reconcileWhopMain()
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result)
}
