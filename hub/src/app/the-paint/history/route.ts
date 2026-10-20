import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { PAINT_MARKETS } from '@/lib/nbaPaint'
import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { nbaFirstMarket } from '@/lib/nbaFirstBasketMarkets'
import { getNbaMarketFrames, getNbaQuoteOpenings } from '@/lib/nbaOddsHistoryData'
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const game = request.nextUrl.searchParams.get('game'), market = request.nextUrl.searchParams.get('market'), player = request.nextUrl.searchParams.get('player')
  if (!/^\d{1,10}$/.test(game ?? '') || !(PAINT_MARKETS.some(m=>m.key===market) || nbaFirstMarket(market ?? '')) || (player && !/^\d{1,10}$/.test(player))) return NextResponse.json({error:'Choose a valid market'},{status:400})
  const mode=nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  try {
    const [frames,openings] = await Promise.all([
      getNbaMarketFrames(Number(game),market!,player ? Number(player) : null,mode),
      getNbaQuoteOpenings(Number(game),mode),
    ])
    const openingRows = openings.filter(row => row.game_id === Number(game) && row.market === market && (!player || row.player_id === Number(player)))
    return NextResponse.json({frames,openingRows,mode},{headers:{'Cache-Control':'private, no-store'}})
  } catch { return NextResponse.json({error:'Market history unavailable'},{status:503}) }
}
