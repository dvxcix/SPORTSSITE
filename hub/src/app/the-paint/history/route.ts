import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { PAINT_MARKETS } from '@/lib/nbaPaint'
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const game = request.nextUrl.searchParams.get('game'), market = request.nextUrl.searchParams.get('market'), player = request.nextUrl.searchParams.get('player')
  if (!/^\d{1,10}$/.test(game ?? '') || !PAINT_MARKETS.some(m=>m.key===market) || (player && !/^\d{1,10}$/.test(player))) return NextResponse.json({error:'Choose a valid market'},{status:400})
  const {data,error} = await createAdminClient().rpc('read_nba_market_captures',{p_game_id:Number(game),p_market:market,p_player:player ? Number(player) : null}).abortSignal(AbortSignal.timeout(12_000))
  if (error) return NextResponse.json({error:'Market history unavailable'},{status:503})
  return NextResponse.json({frames:data ?? []},{headers:{'Cache-Control':'private, no-store'}})
}
