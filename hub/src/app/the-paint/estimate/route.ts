import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { nbaMarketLogs, nbaSample, nbaValue, PAINT_MARKETS, type PaintMarket } from '@/lib/nbaPaint'
import { nbaValidatedEstimate } from '@/lib/nbaModel'
import { getNbaResearchModels } from '@/lib/nbaResearchResources'
import { resolveNbaResearchBundle } from '@/lib/nbaResearchBundle'

export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const game = request.nextUrl.searchParams.get('game'), player = request.nextUrl.searchParams.get('player'), market = request.nextUrl.searchParams.get('market')
  if (!/^\d{1,10}$/.test(game ?? '') || !/^\d{1,10}$/.test(player ?? '') || !PAINT_MARKETS.some(item => item.key === market)) return NextResponse.json({ error: 'Choose a valid player and market' }, { status: 400 })
  try {
    const initial = await getPaintGame(Number(game)).then(game => getPaintBoard(game, mode))
    const { board, value: reports } = await resolveNbaResearchBundle(initial, mode, board => getNbaResearchModels(board, mode))
    const selected = board.players.find(item => item.id === Number(player))
    if (!selected) return NextResponse.json({ error: 'Player not in this matchup' }, { status: 404 })
    const logs = nbaMarketLogs(selected, market!).filter(log => log.game.date.slice(0, 10) < board.game.date)
    const report = reports.find(item => item.market === market && item.validationThrough < board.game.date)
    const games = nbaSample(logs.filter(log => (log.game.status_state === 'final' || log.game.status === 'Final') && nbaValue(log, market!) != null), report?.method === 'last10' ? 10 : 20).length
    return NextResponse.json({ gameId: board.game.id, playerId: selected.id, market, estimate: nbaValidatedEstimate(logs, market as PaintMarket, board.game.date, report), games, fetchedAt: board.fetchedAt }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Projection unavailable' }, { status: 503 }) }
}
