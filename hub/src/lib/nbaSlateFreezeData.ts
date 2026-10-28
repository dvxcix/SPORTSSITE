import 'server-only'
import { createHash } from 'node:crypto'
import { nbaPeriod, nbaReference, nbaMarketLogs, nbaSample, nbaAverage, PAINT_MARKETS, type PaintBoard, type PaintGame, type PaintMarket, type PaintPlayer, type PaintStat, type PaintProp } from './nbaPaint'
import { nbaMarketRanks, nbaFormGap } from './nbaMarketMetrics'
import { nbaSelectedPlayers, type NbaMarketSelection } from './nbaMarketSelection'
import { nbaGameStart, nbaPregameOpen, type NbaOddsMode } from './nbaOddsMode'
import { readNbaPregameResearch, saveNbaPregameResearch } from './nbaPregameResearchData'
import type { nbaSlateRows } from './nbaSlate'
import { nbaValidatedEstimate, type NbaModelReport } from './nbaModel'
import { nbaSlateHeatDomains, type NbaSlateHeatDomains } from './nbaSlateHeat'

type PoolQuote = [string, string, string, 'milestone' | 'over_under', number | null, number | null, number | null, string]
type PackedPoolQuote = [number, number, string, 0 | 1, number | null, number | null, number | null, number]
type PoolLog = [number, number, string, number, number, number, number | null, boolean | null, string, string | null, string, number | null, ...(number | null)[]]
type PoolPlayer = { id: number; gameId: number; average: PaintPlayer['average']; logs: PoolLog[]; props: PoolQuote[] }
type PackedPoolPlayer = Omit<PoolPlayer, 'props'> & { props: PackedPoolQuote[] }
type PoolBase = { date: string; gameIds: number[]; period: 0 | 1; models?: { reports: NbaModelReport[]; games: { gameId: number; indexes: number[] }[] } }
export type NbaSlatePoolV1 = PoolBase & { version: 1; players: PoolPlayer[] }
export type NbaSlatePoolV2 = PoolBase & { version: 2; players: PackedPoolPlayer[]; dictionary: { vendors: string[]; markets: string[]; timestamps: string[] } }
export type NbaSlatePool = NbaSlatePoolV1 | NbaSlatePoolV2
type GameModels = { gameId: number; reports: NbaModelReport[] }[]
const resource = (period: number) => period ? 'slate-mm-q1:v1' : 'slate-mm-full:v1'
const markets = new Set<string>(PAINT_MARKETS.map(market => market.key))
const statFields = ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'turnover', 'fga', 'fgm', 'fg3a', 'fta', 'ftm'] as const
function packLog(log: PaintStat): PoolLog {
  return [log.id, log.game.id, log.game.date, log.team.id, log.game.home_team_id, log.game.visitor_team_id, log.game.season ?? null, log.game.postseason ?? null, log.game.status, log.game.status_state ?? null, log.min, log.period ?? null, ...statFields.map(field => log[field])]
}
/** Lossless quote dictionaries. Kept separate from capture until all live
 * readers can interpret v2; existing v1 observations remain readable. */
export function encodeNbaSlatePool(pool: NbaSlatePoolV1): NbaSlatePoolV2 {
  const vendors = new Map<string, number>(), markets = new Map<string, number>(), timestamps = new Map<string, number>()
  const intern = (table: Map<string, number>, value: string) => {
    const prior = table.get(value)
    if (prior != null) return prior
    const index = table.size; table.set(value, index); return index
  }
  const players = pool.players.map(player => ({ ...player, props: player.props.map((row): PackedPoolQuote => {
    // Never silently convert an unexpected provider value into a different
    // contract or an unreadable archive. An existing observation remains safe.
    if (!Array.isArray(row) || row.length !== 8 || typeof row[0] !== 'string' || typeof row[1] !== 'string' || typeof row[2] !== 'string'
      || (row[3] !== 'milestone' && row[3] !== 'over_under')
      || ![row[4], row[5], row[6]].every(value => value === null || typeof value === 'number' && Number.isFinite(value))
      || typeof row[7] !== 'string' || !Number.isFinite(Date.parse(row[7]))) throw new Error('Invalid NBA slate quote')
    return [intern(vendors, row[0]), intern(markets, row[1]), row[2], row[3] === 'milestone' ? 0 : 1,
      row[4], row[5], row[6], intern(timestamps, row[7])]
  }) }))
  return { ...pool, version: 2, players, dictionary: { vendors: [...vendors.keys()], markets: [...markets.keys()], timestamps: [...timestamps.keys()] } }
}

function decodeQuote(pool: NbaSlatePoolV2, row: PackedPoolQuote): PoolQuote {
  const pick = (values: string[], index: number) => {
    if (!Array.isArray(values) || !Number.isSafeInteger(index) || index < 0 || index >= values.length || typeof values[index] !== 'string') throw new Error('Invalid NBA slate dictionary')
    return values[index]
  }
  if (!Array.isArray(row) || row.length !== 8 || typeof row[2] !== 'string' || (row[3] !== 0 && row[3] !== 1)
    || ![row[4], row[5], row[6]].every(value => value === null || typeof value === 'number' && Number.isFinite(value))
    || !pool.dictionary) throw new Error('Invalid NBA slate quote')
  return [pick(pool.dictionary.vendors, row[0]), pick(pool.dictionary.markets, row[1]), row[2], row[3] === 0 ? 'milestone' : 'over_under', row[4], row[5], row[6], pick(pool.dictionary.timestamps, row[7])]
}

export function nbaSlatePoolPlayers(pool: NbaSlatePool): PaintPlayer[] {
  return pool.players.map(player => {
    const logs = player.logs.map(row => ({
      id: row[0], player: { id: player.id }, team: { id: row[3] }, game: { id: row[1], date: row[2], home_team_id: row[4], visitor_team_id: row[5], season: row[6] ?? undefined, postseason: row[7] ?? undefined, status: row[8], status_state: row[9] ?? undefined }, min: row[10], period: row[11] ?? undefined,
      ...Object.fromEntries(statFields.map((field, index) => [field, row[12 + index]])),
    })) as PaintStat[]
    const quotes: PoolQuote[] = pool.version === 2 ? (player.props as PackedPoolQuote[]).map(row => decodeQuote(pool, row)) : player.props as PoolQuote[]
    const props: PaintProp[] = quotes.map((row, index) => ({ id: index, game_id: player.gameId, player_id: player.id, vendor: row[0], prop_type: row[1], line_value: row[2], market: { type: row[3], odds: row[4] ?? undefined, over_odds: row[5] ?? undefined, under_odds: row[6] ?? undefined }, updated_at: row[7] }))
    // Identity text/artwork does not participate in MM. Game/player IDs and
    // historical venue IDs remain exact; display identities use the own board.
    return { id: player.id, first_name: '', last_name: '', position: '', team: { id: 0, abbreviation: '', full_name: '', name: '' }, headshot: null, injury: null, average: player.average, logs: pool.period ? [] : logs, periodLogs: pool.period ? logs : [], props }
  })
}

/** The comparison universe is captured before filters, never replaced by one matchup. */
export function nbaSlatePool(games: PaintGame[], boards: PaintBoard[], complete: boolean, period: 0 | 1, observedAt: string, models: GameModels = []): NbaSlatePoolV1 | null {
  const now = Date.parse(observedAt), ids = new Set(games.map(game => game.id))
  if (!complete || !games.length || games.length > 16 || ids.size !== games.length || !Number.isFinite(now)
    || new Set(games.map(game => game.date)).size !== 1 || boards.length !== games.length
    || new Set(boards.map(board => board.game.id)).size !== games.length) return null
  if (boards.some(board => !ids.has(board.game.id) || board.game.date !== games[0].date || !board.statsComplete
    || period === 1 && board.periodStatsComplete !== true)) return null
  const players = boards.flatMap(board => {
    const tip = nbaGameStart(board.game)
    return board.players.map(player => ({
      id: player.id, gameId: board.game.id, average: player.average,
      logs: (period ? player.periodLogs ?? [] : player.logs).filter(log => log.player.id === player.id && log.game.id !== board.game.id && log.game.date.slice(0, 10) < board.game.date).map(packLog),
      props: player.props.filter(quote => quote.game_id === board.game.id && quote.player_id === player.id
        && markets.has(quote.prop_type) && nbaPeriod(quote.prop_type) === period && tip != null
        && Date.parse(quote.updated_at) < tip && Date.parse(quote.updated_at) <= now)
        .map((quote): PoolQuote => [quote.vendor, quote.prop_type, quote.line_value, quote.market.type, quote.market.odds ?? null, quote.market.over_odds ?? null, quote.market.under_odds ?? null, quote.updated_at]),
    }))
  })
  const reports: NbaModelReport[] = [], signatures: string[] = []
  const modelGames = models.filter(item=>ids.has(item.gameId)).map(item=>({gameId:item.gameId,indexes:item.reports.map(report=>{
    const signature=JSON.stringify(report), existing=signatures.indexOf(signature)
    if(existing>=0)return existing
    signatures.push(signature);reports.push(report);return reports.length-1
  })}))
  return { version: 1, date: games[0].date, gameIds: [...ids].sort((a, b) => a - b), period, players, models:{reports,games:modelGames} }
}

/** Used by the existing research pass and ordinary complete slate reads. */
export async function captureNbaSlatePools(games: PaintGame[], boards: PaintBoard[], complete: boolean, observedAt = new Date().toISOString(), models: GameModels = []) {
  const open = games.filter(game => nbaPregameOpen(game))
  const saved = { full: 0, quarter: 0 }
  if (!open.length) return saved
  for (const period of [0, 1] as const) {
    const pool = nbaSlatePool(games, boards, complete, period, observedAt, models)
    if (!pool) continue
    // Preserve the original bound, and enforce it again on the actual encoded
    // payload before fan-out. The database independently enforces its limit.
    if (Buffer.byteLength(JSON.stringify(pool)) > 8 * 1024 * 1024) throw new Error('NBA slate comparison snapshot exceeds its size limit')
    const packed = encodeNbaSlatePool(pool)
    if (Buffer.byteLength(JSON.stringify(packed)) > 8 * 1024 * 1024) throw new Error('NBA slate comparison snapshot exceeds its size limit')
    const results = await Promise.all(open.map(game => saveNbaPregameResearch(game, resource(period), { value: packed, observedAt })))
    saved[period ? 'quarter' : 'full'] = results.filter(Boolean).length
  }
  return saved
}

export type NbaSlateFreeze = { ranks: Map<string, number>; unavailable: number[]; observedAt: Record<number, string>; heatDomains:Record<number,NbaSlateHeatDomains> }
export type NbaLegacySlate = { date: string; market: PaintMarket; book: string; side: 'over' | 'under'; type: 'milestone' | 'over_under' | 'auto'; target: number | 'auto'; complete: true; gameIds: number[]; rows: ReturnType<typeof nbaSlateRows>; heatDomains?:NbaSlateHeatDomains }
export function nbaLegacySlateResource(date: string, market: PaintMarket, book: string, side: 'over' | 'under', selection?: NbaMarketSelection) {
  return 'slate-legacy:v1:' + createHash('md5').update([date, market, book, side, selection?.type ?? 'auto', selection?.line ?? 'auto'].join('|')).digest('hex')
}
/** Recovery is exact-filter only. A cached result cannot supply a different
 * sportsbook, contract, target, side or comparison universe. */
export async function getNbaLegacySlateRows(game: PaintGame, market: PaintMarket, book: string, side: 'over' | 'under', selection?: NbaMarketSelection) {
  if (nbaPregameOpen(game)) return null
  const saved = await readNbaPregameResearch<NbaLegacySlate>(game, nbaLegacySlateResource(game.date, market, book, side, selection))
  const value = saved?.value, tip = nbaGameStart(game)
  if (!saved || !value || value.date !== game.date || value.market !== market || value.book !== book || value.side !== side
    || value.type !== (selection?.type ?? 'auto') || value.target !== (selection?.line ?? 'auto') || value.complete !== true
    || !Array.isArray(value.gameIds) || !value.gameIds.includes(game.id) || new Set(value.gameIds).size !== value.gameIds.length
    || !Array.isArray(value.rows) || tip == null) return null
  const ids = new Set<number>()
  for (const row of value.rows) {
    if (!row?.player || !row.offer || row.game?.id !== game.id || row.game.date !== game.date || row.market !== market
      || row.offer.game_id !== game.id || row.offer.player_id !== row.player.id || row.offer.prop_type !== market
      || book !== 'all' && row.offer.vendor !== book || !Number.isFinite(Date.parse(row.offer.updated_at))
      || Date.parse(row.offer.updated_at) >= tip || Date.parse(row.offer.updated_at) > Date.parse(saved.observedAt)
      || !nbaSelectedPlayers([{ props: [row.offer] } as PaintPlayer], market, selection)[0].props.length
      || ids.has(row.player.id)) return null
    ids.add(row.player.id)
  }
  return saved
}
/** Re-run at response time: a cached live slate cannot cross an anchor's cutoff. */
export async function getNbaSlateRanks(games: PaintGame[], boards: PaintBoard[], market: PaintMarket, book: string, selection: NbaMarketSelection | undefined, mode: NbaOddsMode, complete: boolean, side:'over'|'under'='over'): Promise<NbaSlateFreeze> {
  const ranks = new Map<string, number>(), unavailable: number[] = [], observedAt: Record<number, string> = {}, heatDomains:Record<number,NbaSlateHeatDomains>={}
  const current = complete ? nbaMarketRanks(nbaSelectedPlayers(boards.flatMap(board => board.players), market, selection), market, book) : new Map()
  if (mode === 'live') {
    for (const board of boards) for (const player of board.players) { const rank = current.get(player.id); if (rank) ranks.set(`${board.game.id}:${player.id}`, rank.mm) }
    return { ranks, unavailable, observedAt, heatDomains }
  }
  await Promise.all(games.map(async game => {
    const board = boards.find(board => board.game.id === game.id)
    if (!board) return
    if (nbaPregameOpen(game)) {
      for (const player of board.players) { const rank = current.get(player.id); if (rank) ranks.set(`${game.id}:${player.id}`, rank.mm) }
      return
    }
    const snapshot = await readNbaPregameResearch<NbaSlatePool>(game, resource(nbaPeriod(market)))
    const pool = snapshot?.value
    if (!snapshot || !pool || (pool.version !== 1 && pool.version !== 2) || pool.date !== game.date || pool.period !== nbaPeriod(market)
      || !Array.isArray(pool.gameIds) || !pool.gameIds.includes(game.id) || !Array.isArray(pool.players)) {
      unavailable.push(game.id); return
    }
    if (pool.models != null && (!Array.isArray(pool.models.reports) || !Array.isArray(pool.models.games)
      || !pool.models.games.every(entry => entry && typeof entry === 'object' && Number.isSafeInteger(entry.gameId)
        && Array.isArray(entry.indexes) && entry.indexes.every(index => Number.isSafeInteger(index) && index >= 0 && index < pool.models!.reports.length)))) {
      unavailable.push(game.id); return
    }
    let allPlayers: PaintPlayer[]
    try { allPlayers = nbaSlatePoolPlayers(pool) } catch { unavailable.push(game.id); return }
    if (pool.version === 2 && (!Number.isFinite(Date.parse(snapshot.observedAt)) || allPlayers.some(player => player.props.some(quote => {
      const at = Date.parse(quote.updated_at)
      return !Number.isFinite(at) || at > Date.parse(snapshot.observedAt)
    })))) { unavailable.push(game.id); return }
    const players=nbaSelectedPlayers(allPlayers, market, selection), frozen = nbaMarketRanks(players, market, book)
    heatDomains[game.id]=nbaSlateHeatDomains(players.flatMap(player=>{
      const offer=nbaReference(player.props,market,book,side)
      if(!offer)return []
      const owner=pool.players.find(candidate=>candidate.id===player.id)?.gameId
      const reports=pool.models?.games.find(candidate=>candidate.gameId===owner)?.indexes.map(index=>pool.models!.reports[index])??[]
      const report=reports.find(report=>report?.market===market&&report.validationThrough<game.date)
      const logs=nbaMarketLogs(player,market),average=nbaAverage(nbaSample(logs,10),market)
      return [{average,estimate:nbaValidatedEstimate(logs,market,game.date,report),gap:nbaFormGap(average,offer,side)}]
    }))
    observedAt[game.id] = snapshot.observedAt
    for (const player of board.players) {
      // Frozen roster and whole-slate membership must both contain this player.
      if (!pool.players.some(peer => peer.id === player.id && peer.gameId === game.id)) continue
      const rank = frozen.get(player.id)
      if (rank) ranks.set(`${game.id}:${player.id}`, rank.mm)
    }
  }))
  return { ranks, unavailable: unavailable.sort((a, b) => a - b), observedAt, heatDomains }
}
