import { NextRequest, NextResponse } from 'next/server'
import { GET as history } from '@/app/the-paint/history/route'
import { nbaMilestoneMovements, nbaMovement, type PaintFrame } from '@/lib/nbaMovement'
import type { NbaQuoteOpeningRow } from '@/lib/nbaOddsHistory'
import { PAINT_MARKETS } from '@/lib/nbaPaint'

const headers = { 'Cache-Control': 'private, no-store' }
const timestamp = (value: string | null) => {
  const at = value == null ? NaN : Date.parse(value)
  return Number.isFinite(at) ? at : null
}

export async function getNativeCourtMovement(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const game = params.get('game'), player = params.get('player'), book = params.get('book')
  const market = PAINT_MARKETS.find(item => item.key === params.get('market'))?.key
  const mode = params.get('mode') ?? 'pregame', side = params.get('side') ?? 'over'
  const contract = params.get('contract') ?? 'milestone'
  const targetValue = params.get('target'), target = targetValue == null ? undefined : Number(targetValue)
  const capture = params.get('capture'), captureTime = timestamp(capture)
  if (!/^[1-9]\d{0,9}$/.test(game ?? '') || player != null && !/^[1-9]\d{0,9}$/.test(player) ||
      !market || !book || !/^[a-z0-9_]{1,40}$/.test(book) || !['pregame', 'live'].includes(mode) ||
      !['over', 'under'].includes(side) || !['milestone', 'over_under'].includes(contract) ||
      contract === 'milestone' && side === 'under' ||
      target != null && (!targetValue?.trim() || !Number.isFinite(target) || target < 0 || target > 1000) ||
      capture != null && (capture.length > 40 || captureTime == null)) {
    return NextResponse.json({ error: 'Choose a valid market and capture' }, { status: 400, headers })
  }

  // Use the same entitlement, eligible roster and durable phase frames as The Court.
  const result = await history(request)
  if (!result.ok) return result
  const { frames, openingRows } = await result.json() as { frames: PaintFrame[]; openingRows: NbaQuoteOpeningRow[] }
  const ordered = [...frames].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))
  const captures = ordered.map(frame => frame.captured_at)
  const selected = captureTime == null ? ordered : ordered.filter(frame => Date.parse(frame.captured_at) <= captureTime)
  const latest = selected.at(-1)
  const books = [...new Set(ordered.flatMap(frame => frame.props.map(quote => quote.vendor)))].sort()
  const selectedQuotes = latest?.props.filter(quote => quote.vendor === book && quote.market.type === contract) ?? []
  const players = [...new Set(selectedQuotes.map(quote => quote.player_id))]
  const targets = [...new Set(selectedQuotes.map(quote => Number(quote.line_value)).filter(Number.isFinite))].sort((a, b) => a - b)
  const scoped = selected.map(frame => ({ ...frame, props: frame.props.filter(quote =>
    quote.vendor === book && quote.market.type === contract && (target == null || Number(quote.line_value) === target)) }))
  const standard = side === 'under' ? 'under' : 'over'
  const rows = players.flatMap(playerId => {
    const movements = contract === 'milestone'
      ? nbaMilestoneMovements(scoped, playerId, market, book, openingRows, target).map(row => row.movement)
      : [nbaMovement(scoped, playerId, market, book, standard, openingRows)]
    return movements.flatMap(movement => {
      if (!movement.latest) return []
      return [{ playerId, line: movement.latest.line, firstLine: movement.first?.line ?? null,
        lineChange: movement.lineChange, movement: movement.priceChange, openingKnown: movement.priceOpeningKnown,
        firstPrice: movement.priceFirstOdds, firstAt: movement.priceFirstAt,
        price: contract === 'milestone' || standard === 'over' ? movement.latest.over : movement.latest.under,
        points: player == null ? [] : movement.points.slice(-160).map(point => ({
          at: point.at, line: point.line, price: contract === 'milestone' || standard === 'over' ? point.over : point.under,
        })) }]
    })
  })
  return NextResponse.json({ gameId: Number(game), market, mode, book, side, contract, captures,
    selectedAt: latest?.captured_at ?? null, books, targets, rows }, { headers })
}
