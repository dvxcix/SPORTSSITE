import { NextResponse } from 'next/server'
import { BROWSERBASE_PLAN, browserbasePlanUsage, getBrowserbaseUsageSummary } from '@/lib/browserbaseUsage'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

export const maxDuration = 30
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error

  const usage = await getBrowserbaseUsageSummary().catch(() => null)
  if (!usage) return NextResponse.json({ error: 'Browser automation usage could not be loaded' }, { status: 503, headers })

  const browserMinutes = Number(process.env.BROWSERBASE_BROWSER_MINUTE_BUDGET) || 25_500
  const proxyBytes = Number(process.env.BROWSERBASE_PROXY_BYTE_BUDGET) || 4_250_000_000
  return NextResponse.json({
    usage,
    plan: BROWSERBASE_PLAN,
    totals: browserbasePlanUsage(usage),
    alerts: { browserMinutes, proxyBytes, browserExceeded: usage.browserMinutes >= browserMinutes,
      proxyExceeded: usage.proxyBytes >= proxyBytes },
  }, { headers })
}
