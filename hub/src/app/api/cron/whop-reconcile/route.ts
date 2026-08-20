import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { reconcileWhopMain } from '@/lib/whopMainReconcile'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const GET = withPipelineHealth('whop-reconcile', run)

// Safety net for the MAIN tier-payments Whop business's webhook
// (/api/webhooks/whop) — now confirmed working (signature bug fixed, real
// events processing correctly live), so this backstops whatever it might
// still miss rather than being the primary grant path. It directly verifies
// every locally linked main-business membership instead of repeatedly
// enumerating the provider's entire catalog. Runs every 15 minutes.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const result = await reconcileWhopMain()
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result)
}
