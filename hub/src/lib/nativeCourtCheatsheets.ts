import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from './paintAccess'
import { getPaintBoard, getPaintGame } from './nbaPaintData'
import { PAINT_MARKETS, nbaAverage, nbaMarketLogs, nbaPrice, nbaSample } from './nbaPaint'
import { nbaSelectedProps } from './nbaMarketSelection'
import { nbaOddsMode } from './nbaOddsMode'
import { nbaCheatsheet } from './nbaResearch'
import { nbaSeasonDisplayBoard } from './nbaSeasonDisplay'

const headers = { 'Cache-Control': 'private, no-store' }

export async function getNativeCourtCheatsheets(request: NextRequest) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const query = request.nextUrl.searchParams
  const game = query.get('game') ?? '', book = query.get('book') ?? 'all'
  const side = query.get('side') ?? 'over', location = query.get('location') ?? 'all'
  const market = query.get('market'), mode = nbaOddsMode(query.get('mode'))
  const contract = query.get('contract') ?? 'all', target = query.get('target')
  if (!/^\d{1,10}$/.test(game) || !/^[a-z0-9_]{1,30}$/.test(book) ||
    (side !== 'over' && side !== 'under') || (location !== 'home' && location !== 'away' && location !== 'all') ||
    !['all', 'milestone', 'over_under'].includes(contract) ||
    (market != null && !PAINT_MARKETS.some(item => item.key === market)) ||
    (target != null && (market == null || !/^\d+(?:\.\d+)?$/.test(target) || !Number.isFinite(Number(target))))) {
    return NextResponse.json({ error: 'Invalid Cheatsheets filters' }, { status: 400, headers })
  }
  try {
    const source = await getPaintBoard(await getPaintGame(Number(game)), mode)
    const board = nbaSeasonDisplayBoard(source)
    const markets = PAINT_MARKETS.filter(item => source.players.some(player => player.props.some(offer => offer.prop_type === item.key)))
      .map(({key,label}) => ({ key, label }))
    const books = [...new Set(source.players.flatMap(player => player.props.map(offer => offer.vendor)))].sort()
    const selection = contract === 'milestone' || contract === 'over_under' ? { type: contract } as const : undefined
    const select = (props: typeof board.players[number]['props'], line?: number) => {
      if (!market) return props
      return selection ? nbaSelectedProps(props, market, { ...selection, line })
        : props.filter(offer => line == null || offer.prop_type !== market || Number(offer.line_value) === line)
    }
    const lines = [...new Set(source.players.flatMap(player => select(player.props)
      .filter(offer => market === offer.prop_type && (book === 'all' || offer.vendor === book) && nbaPrice(offer, side) != null)
      .map(offer => Number(offer.line_value))))]
      .filter(line => Number.isFinite(line) && line >= 0).sort((a, b) => a - b)
    const players = board.players.map(player => ({ ...player, props: select(player.props, target == null ? undefined : Number(target)) }))
    const table = board === source ? nbaCheatsheet(players, book, side, location, source) : []
    const rows = table.filter(row => market == null || row.market.key === market).map(row => ({
      playerId: row.player.id, market: row.market.key, label: row.market.label,
      book: row.offer.vendor, line: Number(row.offer.line_value), odds: nbaPrice(row.offer, side) ?? null,
      mm: row.mm, hit: row.hit, gap: row.gap, season: row.season, milestone: row.offer.market.type === 'milestone',
      average: row.average, recent: nbaAverage(nbaSample(nbaMarketLogs(row.player, row.market.key),5,location),row.market.key),
    }))
    return NextResponse.json({
      gameId: source.game.id, date: source.game.date, mode,
      snapshotAt: source.researchSnapshot?.observedAt ?? source.fetchedAt,
      complete: board === source && source.statsComplete, markets, books, lines, rows,
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'Cheatsheets could not refresh' }, { status: 503, headers })
  }
}
