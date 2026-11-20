import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getNbaGameOverview, getNbaHeaderPrices } from '@/lib/nbaGameOverviewData'
import { nbaOddsMode } from '@/lib/nbaOddsMode'

export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const id = request.nextUrl.searchParams.get('game')
  if (!id || !/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: 'Choose a matchup' }, { status: 400 })
  const headers = { 'Cache-Control': 'private, no-store' }
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode')), prices = request.nextUrl.searchParams.get('prices') === '1'
  // Public observations are explicitly pregame. Price-only reads retain the
  // same pregame/live clock and archive rules as every other NBA tool.
  const [publicResult, priceResult] = await Promise.allSettled([
    mode === 'live' ? Promise.resolve(null) : getNbaGameOverview(Number(id)),
    prices ? getNbaHeaderPrices(Number(id), mode) : Promise.resolve(null),
  ])
  return NextResponse.json({
    overview: publicResult.status === 'fulfilled' ? publicResult.value : null,
    publicUnavailable: publicResult.status === 'rejected',
    ...(prices ? { gameOdds: priceResult.status === 'fulfilled' ? priceResult.value : [], pricesUnavailable: priceResult.status === 'rejected' } : {}),
  }, { headers })
}
