import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { PAINT_MARKETS } from '@/lib/nbaPaint'
import { getNbaQuoteOpenings } from '@/lib/nbaOddsHistoryData'
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const game = request.nextUrl.searchParams.get('game'), market = request.nextUrl.searchParams.get('market'), player = request.nextUrl.searchParams.get('player')
  if (!/^\d{1,10}$/.test(game ?? '') || !PAINT_MARKETS.some(m=>m.key===market) || (player && !/^\d{1,10}$/.test(player))) return NextResponse.json({error:'Choose a valid market'},{status:400})
  try {
    const [{data,error},openings] = await Promise.all([
      createAdminClient().rpc('read_nba_market_captures',{p_game_id:Number(game),p_market:market,p_player:player ? Number(player) : null}).abortSignal(AbortSignal.timeout(12_000)),
      getNbaQuoteOpenings(Number(game)),
    ])
    if (error) throw new Error('Market history unavailable')
    const openingRows = openings.filter(row => row.game_id === Number(game) && row.market === market && (!player || row.player_id === Number(player)))
    return NextResponse.json({frames:data ?? [],openingRows},{headers:{'Cache-Control':'private, no-store'}})
  } catch { return NextResponse.json({error:'Market history unavailable'},{status:503}) }
}
