import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { reconcileWhopMain } from '@/lib/whopMainReconcile'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const GET = withPipelineHealth('whop-reconcile', run)

// Safety net for the MAIN tier-payments Whop business's webhook
// (/api/webhooks/whop) — now confirmed working (signature bug fixed, real
// events processing correctly live), so this backstops whatever it might
// still miss rather than being the primary grant path. Same shape as
// /api/cron/whop-addon-reconcile, across all 5 real Basic/Advanced/
// Ultimate plans instead of the one add-on plan. Runs every 15 minutes
// (vercel.json).
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const result = await reconcileWhopMain()
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result)
}
