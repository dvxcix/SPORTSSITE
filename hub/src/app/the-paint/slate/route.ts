import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { getPaintBoard, getPaintSchedule } from '@/lib/nbaPaintData'
import { nbaPeriod, nbaDate, PAINT_MARKETS, type PaintBoard, type PaintMarket } from '@/lib/nbaPaint'
import { getNbaDefenseContext } from '@/lib/nbaIntelligenceData'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NbaModelReport } from '@/lib/nbaModel'
import { nbaSlateRows } from '@/lib/nbaSlate'
import { getNbaMarketContext } from '@/lib/nbaMarketSignalData'
import { nbaMarketSupportView, nbaPlayerMarketSignals } from '@/lib/nbaMarketSignal'
import { nbaContextualScore } from '@/lib/nbaIntelligence'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const date = request.nextUrl.searchParams.get('date'), market = request.nextUrl.searchParams.get('market'), book = request.nextUrl.searchParams.get('book') ?? 'all', side = request.nextUrl.searchParams.get('side') ?? 'over'
  if (!date || nbaDate(date) !== date || !PAINT_MARKETS.some(item => item.key === market) || !/^[a-z0-9_]{1,30}$/.test(book) || !['over', 'under'].includes(side)) return NextResponse.json({ error: 'Invalid NBA slate filters' }, { status: 400 })
  try {
    const cached = await nbaSharedCache(`slate:v7:${date}:${market}:${book}:${side}`, 120, 300, async () => {
      const started = Date.now(), schedule = await getPaintSchedule(date), boards: PaintBoard[] = [], failed: number[] = []
      const games = schedule.games.slice(0, 16)
      for (let offset = 0; offset < games.length; offset += 3) {
        if (Date.now() - started > 60000) { failed.push(...games.slice(offset).map(game => game.id)); break }
        await Promise.all(games.slice(offset, offset + 3).map(async game => { try { boards.push(await getPaintBoard(game)) } catch { failed.push(game.id) } }))
      }
      if (games.length && !boards.length) throw new Error('No NBA boards available')
      const reports = await nbaSharedCache('validated-models:v1',300,300,async()=>{const {data,error}=await createAdminClient().from('nba_model_reports').select('report').eq('version','nba-rolling-v1').order('validation_season',{ascending:false}).limit(48);if(error)throw new Error('Model reports unavailable');return (data??[]).map(row=>row.report as NbaModelReport)})
      const contexts = await Promise.allSettled(boards.map(async board=>({gameId:board.game.id,...await getNbaDefenseContext(board.sampleSeason,board.game.date)})))
      const defense=contexts.flatMap(result=>result.status==='fulfilled'?[result.value]:[])
      const complete = schedule.complete && !failed.length && games.length === schedule.games.length && boards.every(board => board.statsComplete && (!nbaPeriod(market!) || board.periodStatsComplete !== false))
      return { date: schedule.date, games: schedule.games.length, loaded: boards.length, complete, failed, defenseUnavailable:contexts.filter(result=>result.status==='rejected'||result.status==='fulfilled'&&!result.value.ready).length, rows: nbaSlateRows(boards, market as PaintMarket, book, side as 'over' | 'under', complete, reports.value, defense) }
    }, 120)
    // Keep expensive production research cached, but re-check freshness and the
    // selected exact quote for every response. A warm slate cannot extend a boost.
    const marketContexts=await Promise.all([...new Map(cached.value.rows.map(row=>[row.game.id,row.game])).values()].map(game=>getNbaMarketContext(game)))
    const rows=cached.value.rows.map(row=>{
      const {player,game,market:rowMarket,offer,estimate,mm,average,hit,gap,fetchedAt,issues}=row
      const safe={player,game,market:rowMarket,offer,estimate,mm,average,hit,gap,fetchedAt,issues}
      const contextual=nbaContextualScore(row.baseScore,row.player.id,row.market,row.game.date,{offer:row.offer,side:side as 'over'|'under',context:marketContexts.find(context=>context.gameId===row.game.id)??null})
      const marketSignals=nbaPlayerMarketSignals({playerId:row.player.id,gameId:row.game.id,market:row.market,book,side:side as 'over'|'under',props:row.signalOffers,context:marketContexts.find(context=>context.gameId===row.game.id)??null})
      return {...safe,score:contextual.score,marketSupport:nbaMarketSupportView(contextual.marketSupport),marketSignals:nbaMarketSupportView(marketSignals)}
    }).sort((a,b)=>(b.score??-1)-(a.score??-1)||(b.mm??0)-(a.mm??0))
    return NextResponse.json({ ...cached.value,rows, fetchedAt: cached.fetchedAt, stale: cached.stale }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'NBA slate could not load. Try again shortly.' }, { status: 503 }) }
}
