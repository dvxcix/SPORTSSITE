import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { PAINT_MARKETS, type PaintMarket } from '@/lib/nbaPaint'
import { getNbaMarketFrames, getNbaQuoteOpenings } from '@/lib/nbaOddsHistoryData'
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const game = request.nextUrl.searchParams.get('game'), market = request.nextUrl.searchParams.get('market'), player = request.nextUrl.searchParams.get('player')
  if (!/^\d{1,10}$/.test(game ?? '') || !PAINT_MARKETS.some(m=>m.key===market) || (player && !/^\d{1,10}$/.test(player))) return NextResponse.json({error:'Choose a valid market'},{status:400})
  try {
    const [frames,openings] = await Promise.all([
      getNbaMarketFrames(Number(game),market as PaintMarket,player ? Number(player) : null),
      getNbaQuoteOpenings(Number(game)),
    ])
    const openingRows = openings.filter(row => row.game_id === Number(game) && row.market === market && (!player || row.player_id === Number(player)))
    return NextResponse.json({frames,openingRows},{headers:{'Cache-Control':'private, no-store'}})
  } catch { return NextResponse.json({error:'Market history unavailable'},{status:503}) }
}
