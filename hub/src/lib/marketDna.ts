import { normName } from '@slipsurge/core/nameNorm'
import { computeDugoutSpecsValue, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'
import { fetchHistoricalGameBundles } from '@/lib/matrixBacktest'
import { fetchBoxscoreOutcomes, type MlbBatterOutcome } from '@/lib/mlbBoxscoreOutcomes'
import { fetchHrFeed } from '@/lib/hrFeed'

const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY

const MARKET_DEFINITIONS = [
  ['fhr', 'First HR', 'fhr', 'fhr'],
  ['hr', 'Anytime HR', 'sa', 'saFd'],
  ['hr2', '2+ HR', 'hr2', 'hr2Fd'],
  ['laser105', '105+ HR', 'laser105', 'laser105'],
  ['laser110', '110+ HR', 'laser110', 'laser110'],
  ['moonshot', 'Moonshot', 'moonshot', 'moonshot'],
  ['pa1', 'First PA HR', 'pa1', 'pa1'],
  ['hrMl', 'HR + team win', 'hrMl', 'hrMl'],
  ['hrr', 'H+R+RBI', 'hrr', 'hrrFd'],
  ['rbi1', '1+ RBI', 'rbi', 'rbiFd'],
  ['rbi2', '2+ RBI', 'rbi2', 'rbi2Fd'],
  ['rbi3', '3+ RBI', 'rbi3', 'rbi3Fd'],
  ['tb2', '2+ bases', 'tb', 'tbFd'],
  ['tb3', '3+ bases', 'tb3', 'tb3Fd'],
  ['tb4', '4+ bases', 'tb4', 'tb4Fd'],
  ['tb5', '5+ bases', 'tb5', 'tb5Fd'],
  ['hits1', '1+ hit', 'hits', 'hits'],
  ['hits2', '2+ hits', 'hits2', 'hits2'],
  ['runs1', '1+ run', 'runs', 'runs'],
  ['runs2', '2+ runs', 'runs2', 'runs2'],
  ['single', 'Single', 'singles', 'sngFd'],
  ['double', 'Double', 'doubles', 'dblFd'],
  ['triple', 'Triple', 'triples', 'triFd'],
  ['sb1', '1+ stolen base', 'stolen_bases', 'stolenBases'],
  ['sb2', '2+ stolen bases', 'stolen_bases2', 'stolenBases2'],
] as const

const PICK_KEYS = ['home_runs', 'hits', 'runs', 'stolen_bases', 'singles', 'doubles', 'triples', 'rbi', 'hits_runs_rbi', 'bases'] as const

export type MarketDnaMarket = {
  key: string
  label: string
  current: number | null
  open: number | null
  probabilityMove: number | null
}

export type MarketDnaPlayer = {
  name: string
  nameNorm: string
  mlbId: number
  team: string
  teamName: string
  position: string
  battingOrder: number
  projected: boolean
  gamePk: number
  gameKey: string
  gameDate: string
  gameStatus: string
  gameStarted: boolean
  opponent: string
  pitcherName: string | null
  pitcherHand: string | null
  markets: MarketDnaMarket[]
  picks: Record<string, number>
  metrics: {
    fhrVsAveragePct: number | null
    hrVsAveragePct: number | null
    fhrToHr: number | null
    mgmToFd: number | null
    paToHr: number | null
    hrToRbi: number | null
    hrToRbi2: number | null
    hrToRbi3: number | null
    hrToHrr: number | null
    hrToTb2: number | null
    hrToTb3: number | null
    hrToTb4: number | null
    hrToTb5: number | null
    hrToHr2: number | null
    hrToHrMl: number | null
    precisionHrScore: number | null
    avgEvL5: number | null
    avgLaL5: number | null
    hardHitL5: number | null
    barrelL10: number | null
    pullAirL5: number | null
    batSpeedL5: number | null
  }
}

export type MarketDnaGame = {
  gamePk: number
  gameKey: string
  awayAbbr: string
  homeAbbr: string
  status: string
  gameDate: string
  lineupConfirmed: boolean
  players: MarketDnaPlayer[]
}

export type HistoricalMatch = {
  playerName: string
  team: string | null
  gameDate: string
  gamePk: string | null
  similarity: number
  coverage: number
  didHr: boolean
  hits: number | null
  runs: number | null
  rbis: number | null
  totalBases: number | null
  stolenBases: number | null
  didDouble: boolean
  didTriple: boolean
  battingOrder: number | null
  hrOdds: number | null
  fhrOdds: number | null
  strongestMatches: string[]
  largestDifferences: string[]
}

export type MarketDnaAnalysis = {
  generatedAt: string
  sourceRows: number
  stage: 'current' | 'frozen_close'
  player: MarketDnaPlayer
  samePlayer: {
    matches: HistoricalMatch[]
    matchedHrRate: number | null
    careerHrRate: number | null
    sample: number
  }
  leagueAnalogs: {
    matches: HistoricalMatch[]
    top10HrRate: number | null
    top25HrRate: number | null
    poolHrRate: number | null
    sample: number
  }
  read: {
    profileCoverage: number
    nearestSimilarity: number | null
    historicalHrLift: number | null
    summary: string
  }
}

export type MarketDnaGameComponents = {
  market: number
  settlement: number
  movement: number
  historical: number
  statcast: number
  traffic: number
  publicLeverage: number
}

export type MarketDnaGameRank = {
  rank: number
  score: number
  gapFromLeader: number
  player: MarketDnaPlayer
  components: MarketDnaGameComponents
  signals: string[]
  contradictions: string[]
  historical: {
    matchedHrRate: number | null
    poolHrRate: number | null
    lift: number | null
    nearestSimilarity: number | null
    sample: number
    samePlayerHrRate: number | null
    samePlayerBaselineHrRate: number | null
    samePlayerLift: number | null
    samePlayerSample: number
    profileProbability: number | null
    confidence: number
    settlementShape: {
      multiRbiHrRate: number | null
      fivePlusTbHrRate: number | null
      soloOrOneRbiHrRate: number | null
    }
  }
  outcome: (MlbBatterOutcome & {
    firstHr: boolean
    hrMlWon: boolean
    hrEvents: number
  }) | null
}

export type MarketDnaGameAnalysis = {
  generatedAt: string
  stage: 'current' | 'frozen_close'
  game: MarketDnaGame
  ranking: MarketDnaGameRank[]
  separation: number
  sourceRows: number
  outcomeAvailable: boolean
  score: { away: number; home: number } | null
  actualHomeRuns: Array<{
    mlbId: number | null
    name: string
    team: string
    firstHr: boolean
    homeRuns: number
    rbis: number
    totalBases: number
    hrMlWon: boolean
    pregameRank: number | null
  }>
}

export type MarketDnaSlateAudit = {
  generatedAt: string
  date: string
  games: MarketDnaGameAnalysis[]
  summary: {
    completedGames: number
    gamesWithHomeRun: number
    leaderHitGames: number
    topTwoHitGames: number
    perfectSeparationGames: number
    averageBestHomerRank: number | null
    averageAllHomerRank: number | null
  }
}

type HistoricalRow = Record<string, unknown> & {
  player_name: string
  name_norm: string | null
  team_abbr: string | null
  game_date: string
  game_pk: string | null
  did_hr: boolean
  did_double: boolean
  did_triple: boolean
  hits: number | null
  rbis: number | null
  runs: number | null
  total_bases: number | null
  stolen_bases: number | null
  batting_order: number | null
}

type Feature = {
  label: string
  category: 'market' | 'movement' | 'structure' | 'statcast' | 'context'
  current: number | null
  historical: number | null
  scale: number
  weight: number
}

type GameHistoryEvidence = MarketDnaGameRank['historical']

const HISTORICAL_SELECT = [
  'player_name', 'name_norm', 'team_abbr', 'game_date', 'game_pk', 'did_hr', 'did_double', 'did_triple',
  'hits', 'rbis', 'runs', 'total_bases', 'stolen_bases', 'batting_order',
  'odds_hr_best', 'odds_hr_close', 'odds_hr_drift', 'odds_first_hr_best', 'odds_double_best',
  'odds_hits_best', 'odds_hits_close', 'odds_hits2_best', 'odds_h2_best', 'odds_h3_best',
  'odds_rbi1_best', 'odds_rbi2_best', 'odds_rbi3_best', 'odds_rbi_best', 'odds_rbi_close',
  'odds_runs_best', 'odds_runs_close', 'odds_runs2_best', 'odds_tb2_best', 'odds_tb3_best',
  'odds_tb4_best', 'odds_tb25_best', 'odds_tb35_best', 'odds_tb45_best', 'odds_singles_best',
  'odds_hr15_best', 'hr_rbi_ratio', 'statcast_score', 'brl_pct', 'hard_hit_pct', 'xslg',
  'launch_angle', 'exit_velo', 'fhr_div_pct', 'hr_div_pct', 'sng_rk_pct', 'hr_rk_pct',
  'fhr_rk_pct', 'rbi_rk_pct', 'game_fhr_avg', 'game_hr_avg', 'fhr_vs_game_avg_pct', 'hr_vs_game_avg_pct',
].join(',')

const asNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : value != null && Number.isFinite(Number(value)) ? Number(value) : null
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const implied = (odds: number | null) => odds == null ? null : odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
const probabilityMove = (current: number | null, open: number | null) => {
  const currentProbability = implied(current)
  const openProbability = implied(open)
  return currentProbability == null || openProbability == null ? null : (currentProbability - openProbability) * 100
}
const currentPrice = (props: OddsProps | null, market: string) => asNumber(props?.[market]?.fanduel)
const openPrice = (props: OddsProps | null, field: string) => asNumber(props?.open?.[field])
const marketByKey = (player: MarketDnaPlayer, key: string) => player.markets.find(market => market.key === key) ?? null
const rate = (rows: HistoricalRow[]) => rows.length ? rows.filter(row => row.did_hr).length / rows.length : null

function ratio(bundle: FieldBundle, key: string) {
  return asNumber(computeDugoutSpecsValue(key, bundle.props, bundle.fhrAvg, bundle.saAvg))
}

function buildPlayerProfile(
  date: string,
  game: Awaited<ReturnType<typeof fetchHistoricalGameBundles>>[number],
  player: Awaited<ReturnType<typeof fetchHistoricalGameBundles>>[number]['game']['homeLineup'][number],
  bundle: FieldBundle,
  team: string,
  opponent: string,
  pitcher: { name: string; hand: string } | null,
): MarketDnaPlayer {
  const props = bundle.props
  const markets = MARKET_DEFINITIONS.map(([key, label, market, open]) => {
    const current = currentPrice(props, market)
    const opening = openPrice(props, open)
    return { key, label, current, open: opening, probabilityMove: probabilityMove(current, opening) }
  })
  const picks: Record<string, number> = {}
  for (const key of PICK_KEYS) picks[key] = asNumber(bundle.pikkitEntry?.[key]?.picks) ?? 0
  const l5 = bundle.statcastWindows?.l5
  const l10 = bundle.statcastWindows?.l10
  const started = !/preview|scheduled|pre-game|warmup/i.test(`${game.game.abstractStatus} ${game.game.status}`)
  return {
    name: player.name,
    nameNorm: normName(player.name),
    mlbId: player.mlb_id,
    team,
    teamName: player.team_name,
    position: player.position,
    battingOrder: player.batting_order,
    projected: player.projected,
    gamePk: game.game.gamePk,
    gameKey: game.gameKey,
    gameDate: date,
    gameStatus: game.game.status,
    gameStarted: started,
    opponent,
    pitcherName: pitcher?.name ?? null,
    pitcherHand: pitcher?.hand ?? null,
    markets,
    picks,
    metrics: {
      fhrVsAveragePct: ratio(bundle, 'fhr_pct'),
      hrVsAveragePct: ratio(bundle, 'sa_pct'),
      fhrToHr: ratio(bundle, 'fhr_div_sa'),
      mgmToFd: ratio(bundle, 'm_div_f'),
      paToHr: ratio(bundle, 'pa1_div_sa'),
      hrToRbi: ratio(bundle, 'sa_div_rbi'),
      hrToRbi2: ratio(bundle, 'sa_div_rbi2'),
      hrToRbi3: ratio(bundle, 'sa_div_rbi3'),
      hrToHrr: ratio(bundle, 'sa_div_hrr'),
      hrToTb2: ratio(bundle, 'sa_div_tb'),
      hrToTb3: ratio(bundle, 'sa_div_tb3'),
      hrToTb4: ratio(bundle, 'sa_div_tb4'),
      hrToTb5: ratio(bundle, 'sa_div_tb5'),
      hrToHr2: ratio(bundle, 'sa_div_hr2'),
      hrToHrMl: ratio(bundle, 'sa_div_ml'),
      precisionHrScore: asNumber(bundle.precisionHrScore),
      avgEvL5: asNumber(l5?.avgEv),
      avgLaL5: asNumber(l5?.avgLa),
      hardHitL5: asNumber(l5?.hardHitPct),
      barrelL10: asNumber(l10?.barrelPct),
      pullAirL5: asNumber(l5?.pullAirRate),
      batSpeedL5: asNumber(l5?.avgBatSpeed),
    },
  }
}

export async function buildMarketDnaSlate(date: string): Promise<{ date: string; games: MarketDnaGame[] }> {
  const bundles = await fetchHistoricalGameBundles(date)
  return {
    date,
    games: bundles.map(game => {
      const players = [
        ...game.game.awayLineup.flatMap(player => {
          const bundle = game.awayBundle.get(normName(player.name))
          return bundle ? [buildPlayerProfile(date, game, player, bundle, game.game.awayAbbr, game.game.homeAbbr, game.game.homePitcher)] : []
        }),
        ...game.game.homeLineup.flatMap(player => {
          const bundle = game.homeBundle.get(normName(player.name))
          return bundle ? [buildPlayerProfile(date, game, player, bundle, game.game.homeAbbr, game.game.awayAbbr, game.game.awayPitcher)] : []
        }),
      ].filter(player => player.markets.some(market => market.current != null))
      return {
        gamePk: game.game.gamePk,
        gameKey: game.gameKey,
        awayAbbr: game.game.awayAbbr,
        homeAbbr: game.game.homeAbbr,
        status: game.game.status,
        gameDate: game.game.gameDate,
        lineupConfirmed: game.game.awayLineupConfirmed && game.game.homeLineupConfirmed,
        players,
      }
    }),
  }
}

async function mpGetAll(path: string, maxRows = 10_000): Promise<HistoricalRow[]> {
  if (!MP_KEY) throw new Error('MLB_PARTY_SERVICE_ROLE_KEY is not configured.')
  const pageSize = 1000
  const rows: HistoricalRow[] = []
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const response = await fetch(`${MP_URL}${path}`, {
      headers: { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, Range: `${offset}-${offset + pageSize - 1}` },
      next: { revalidate: 900 },
    })
    if (!response.ok) throw new Error(`Historical profile request failed (${response.status}).`)
    const page = await response.json()
    if (!Array.isArray(page)) throw new Error('Historical profile response was invalid.')
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

function historicalPrice(row: HistoricalRow, ...keys: string[]) {
  for (const key of keys) {
    const value = asNumber(row[key])
    if (value != null) return value
  }
  return null
}

function historicalProbabilityMove(row: HistoricalRow) {
  const close = historicalPrice(row, 'odds_hr_close')
  const drift = asNumber(row.odds_hr_drift)
  if (close == null || drift == null) return null
  // player_outcomes stores drift in American-odds points: close - open.
  return probabilityMove(close, close - drift)
}

function rowKey(row: HistoricalRow) {
  return `${row.player_name}|${row.game_pk ?? ''}|${row.game_date}`
}

function matchKey(match: HistoricalMatch) {
  return `${match.playerName}|${match.gamePk ?? ''}|${match.gameDate}`
}

function relativeToGameAverage(player: MarketDnaPlayer, game: MarketDnaGame, key: string) {
  const playerProbability = marketProbability(player, key)
  const gameAverage = average(game.players.map(candidate => marketProbability(candidate, key)), 0)
  return playerProbability == null || gameAverage <= 0 ? null : ((playerProbability / gameAverage) - 1) * 100
}

function featuresFor(player: MarketDnaPlayer, row: HistoricalRow, game?: MarketDnaGame): Feature[] {
  const market = (key: string) => marketByKey(player, key)?.current ?? null
  const move = (key: string) => marketByKey(player, key)?.probabilityMove ?? null
  const historicalHr = historicalPrice(row, 'odds_hr_close', 'fd_hr', 'odds_hr_best')
  const historicalRbi = historicalPrice(row, 'odds_rbi_close', 'odds_rbi1_best', 'odds_rbi_best')
  const historicalHrProbability = implied(historicalHr)
  const historicalRbiProbability = implied(historicalRbi)
  const historicalHrToRbi = historicalHrProbability != null && historicalRbiProbability
    ? historicalHrProbability / historicalRbiProbability
    : null
  const feature = (label: string, category: Feature['category'], current: number | null, historical: number | null, scale: number, weight: number): Feature => ({ label, category, current, historical, scale, weight })
  return [
    feature('Anytime HR price', 'market', implied(market('hr')), implied(historicalHr), 0.08, 2.5),
    feature('First HR price', 'market', implied(market('fhr')), implied(historicalPrice(row, 'odds_first_hr_best')), 0.05, 2.2),
    feature('Double price', 'market', implied(market('double')), implied(historicalPrice(row, 'odds_double_best')), 0.12, 0.9),
    feature('1+ RBI price', 'market', implied(market('rbi1')), implied(historicalPrice(row, 'odds_rbi_close', 'odds_rbi1_best', 'odds_rbi_best')), 0.14, 1.15),
    feature('2+ RBI price', 'market', implied(market('rbi2')), implied(historicalPrice(row, 'odds_rbi2_best')), 0.08, 1.05),
    feature('1+ hit price', 'market', implied(market('hits1')), implied(historicalPrice(row, 'odds_hits_close', 'odds_hits_best')), 0.15, 0.7),
    feature('2+ hits price', 'market', implied(market('hits2')), implied(historicalPrice(row, 'odds_hits2_best', 'odds_h2_best')), 0.1, 0.75),
    feature('2+ bases price', 'market', implied(market('tb2')), implied(historicalPrice(row, 'odds_tb2_best')), 0.14, 1),
    feature('3+ bases price', 'market', implied(market('tb3')), implied(historicalPrice(row, 'odds_tb3_best', 'odds_tb25_best')), 0.1, 1.1),
    feature('4+ bases price', 'market', implied(market('tb4')), implied(historicalPrice(row, 'odds_tb4_best', 'odds_tb35_best')), 0.08, 1.2),
    feature('1+ run price', 'market', implied(market('runs1')), implied(historicalPrice(row, 'odds_runs_close', 'odds_runs_best')), 0.14, 0.75),
    feature('2+ runs price', 'market', implied(market('runs2')), implied(historicalPrice(row, 'odds_runs2_best')), 0.08, 0.65),
    feature('Single price', 'market', implied(market('single')), implied(historicalPrice(row, 'odds_singles_best')), 0.15, 0.7),
    feature('2+ HR price', 'market', implied(market('hr2')), implied(historicalPrice(row, 'odds_hr15_best')), 0.035, 0.7),
    feature('Anytime HR movement', 'movement', move('hr'), historicalProbabilityMove(row), 4, 1.35),
    feature('FHR vs player baseline', 'structure', player.metrics.fhrVsAveragePct, asNumber(row.fhr_div_pct), 25, 1.15),
    feature('HR vs player baseline', 'structure', player.metrics.hrVsAveragePct, asNumber(row.hr_div_pct), 25, 1.15),
    feature('HR to RBI ratio', 'structure', player.metrics.hrToRbi, historicalHrToRbi, 0.35, 1.25),
    feature('FHR vs this game', 'structure', game ? relativeToGameAverage(player, game, 'fhr') : null, asNumber(row.fhr_vs_game_avg_pct), 35, 1.35),
    feature('HR vs this game', 'structure', game ? relativeToGameAverage(player, game, 'hr') : null, asNumber(row.hr_vs_game_avg_pct), 35, 1.35),
    feature('Batting order', 'context', player.battingOrder, asNumber(row.batting_order), 3, 0.8),
    feature('Barrel rate', 'statcast', player.metrics.barrelL10, asNumber(row.brl_pct), 15, 1.15),
    feature('Hard-hit rate', 'statcast', player.metrics.hardHitL5, asNumber(row.hard_hit_pct), 22, 1),
    feature('Exit velocity', 'statcast', player.metrics.avgEvL5, asNumber(row.exit_velo), 8, 0.8),
    feature('Launch angle', 'statcast', player.metrics.avgLaL5, asNumber(row.launch_angle), 14, 0.55),
  ]
}

function average(values: Array<number | null | undefined>, fallback = 50) {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
}

function percentileMap(players: MarketDnaPlayer[], getter: (player: MarketDnaPlayer) => number | null, higher = true) {
  const values = players.map(getter).filter((value): value is number => value != null && Number.isFinite(value))
  const result = new Map<number, number>()
  if (!values.length) return result
  for (const value of values) {
    if (result.has(value)) continue
    const below = values.filter(other => higher ? other < value : other > value).length
    const equal = values.filter(other => other === value).length
    result.set(value, values.length === 1 ? 50 : ((below + (equal - 1) / 2) / (values.length - 1)) * 100)
  }
  return result
}

function percentileFor(player: MarketDnaPlayer, getter: (candidate: MarketDnaPlayer) => number | null, players: MarketDnaPlayer[], higher = true) {
  const value = getter(player)
  return value == null ? 50 : percentileMap(players, getter, higher).get(value) ?? 50
}

function marketProbability(player: MarketDnaPlayer, key: string) {
  return implied(marketByKey(player, key)?.current ?? null)
}

function marketMove(player: MarketDnaPlayer, key: string) {
  return marketByKey(player, key)?.probabilityMove ?? null
}

function previousBatters(game: MarketDnaGame, player: MarketDnaPlayer) {
  const lineup = game.players.filter(candidate => candidate.team === player.team)
  const byOrder = new Map(lineup.map(candidate => [candidate.battingOrder, candidate]))
  return [1, 2, 3].map(offset => byOrder.get(((player.battingOrder - offset - 1 + 9) % 9) + 1)).filter((candidate): candidate is MarketDnaPlayer => Boolean(candidate))
}

function weightedRate(
  entries: Array<{ row: HistoricalRow; match: HistoricalMatch }>,
  predicate: (row: HistoricalRow) => boolean,
  priorRate: number | null,
  priorWeight: number,
) {
  let weightedHits = (priorRate ?? 0) * priorWeight
  let totalWeight = priorRate == null ? 0 : priorWeight
  for (const entry of entries) {
    const weight = Math.max(.05, Math.pow(entry.match.similarity, 3) * (.65 + entry.match.coverage * .35))
    weightedHits += predicate(entry.row) ? weight : 0
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedHits / totalWeight : null
}

function emptyHistoryEvidence(poolHrRate: number | null): GameHistoryEvidence {
  return {
    matchedHrRate: null,
    poolHrRate,
    lift: null,
    nearestSimilarity: null,
    sample: 0,
    samePlayerHrRate: null,
    samePlayerBaselineHrRate: null,
    samePlayerLift: null,
    samePlayerSample: 0,
    profileProbability: null,
    confidence: 0,
    settlementShape: { multiRbiHrRate: null, fivePlusTbHrRate: null, soloOrOneRbiHrRate: null },
  }
}

function buildHistoryEvidence(
  player: MarketDnaPlayer,
  rows: HistoricalRow[],
  game: MarketDnaGame,
): GameHistoryEvidence {
  const hrOdds = marketByKey(player, 'hr')?.current
  if (hrOdds == null) return emptyHistoryEvidence(rate(rows))
  const lowOdds = Math.max(100, hrOdds * 0.42)
  const highOdds = Math.min(6000, hrOdds * 2.35 + 100)
  const eligible = rows.filter(row => {
    const price = historicalPrice(row, 'odds_hr_close', 'odds_hr_best')
    const order = asNumber(row.batting_order)
    return price != null && price >= lowOdds && price <= highOdds && order != null && Math.abs(order - player.battingOrder) <= 3
  })
  const scored = eligible.map(row => ({ row, match: scoreMatch(player, row, game) }))
    .filter((entry): entry is { row: HistoricalRow; match: HistoricalMatch } => entry.match != null)
    .sort((a, b) => b.match.similarity - a.match.similarity)
  const nearest = scored.slice(0, 40)
  const playerNameNorm = player.nameNorm || normName(player.name)
  const samePlayerPool = rows.filter(row => (row.name_norm || normName(row.player_name)) === playerNameNorm)
  const samePlayer = scored.filter(entry => (entry.row.name_norm || normName(entry.row.player_name)) === playerNameNorm).slice(0, 15)
  const matchedRate = rate(nearest.map(entry => entry.row))
  const poolRate = rate(eligible)
  const samePlayerBaselineHrRate = rate(samePlayerPool)
  const analogPosterior = weightedRate(nearest, row => row.did_hr, poolRate, 7)
  const samePlayerPosterior = weightedRate(samePlayer, row => row.did_hr, samePlayerBaselineHrRate, 4)
  const samePlayerWeight = samePlayer.length ? clamp(samePlayer.length / 8, .15, .5) : 0
  const profileProbability = analogPosterior == null
    ? samePlayerPosterior
    : samePlayerPosterior == null
      ? analogPosterior
      : analogPosterior * (1 - samePlayerWeight) + samePlayerPosterior * samePlayerWeight
  const lift = profileProbability != null && poolRate != null && poolRate > 0 ? profileProbability / poolRate : null
  const samePlayerLift = samePlayerPosterior != null && samePlayerBaselineHrRate != null && samePlayerBaselineHrRate > 0
    ? samePlayerPosterior / samePlayerBaselineHrRate
    : null
  const nearestHr = nearest.filter(entry => entry.row.did_hr)
  const hrOutcomeRate = (predicate: (row: HistoricalRow) => boolean) => nearestHr.length
    ? nearestHr.filter(entry => predicate(entry.row)).length / nearestHr.length
    : null
  const averageSimilarity = average(nearest.slice(0, 15).map(entry => entry.match.similarity), 0)
  const confidence = clamp((Math.min(1, nearest.length / 30) * .7 + Math.min(1, samePlayer.length / 8) * .3) * averageSimilarity)
  return {
    matchedHrRate: matchedRate,
    poolHrRate: poolRate,
    lift,
    nearestSimilarity: nearest[0]?.match.similarity ?? null,
    sample: nearest.length,
    samePlayerHrRate: samePlayerPosterior,
    samePlayerBaselineHrRate,
    samePlayerLift,
    samePlayerSample: samePlayer.length,
    profileProbability,
    confidence,
    settlementShape: {
      multiRbiHrRate: hrOutcomeRate(row => (row.rbis ?? 0) >= 2),
      fivePlusTbHrRate: hrOutcomeRate(row => (row.total_bases ?? 0) >= 5),
      soloOrOneRbiHrRate: hrOutcomeRate(row => (row.rbis ?? 0) <= 1),
    },
  }
}

export function rankMarketDnaGameProfiles(
  game: MarketDnaGame,
  evidenceByMlbId: Record<number, GameHistoryEvidence> = {},
): MarketDnaGameRank[] {
  const players = game.players
  const allHrPicks = players.reduce((sum, player) => sum + (player.picks.home_runs ?? 0), 0)
  const preliminary = players.map(player => {
    const evidence = evidenceByMlbId[player.mlbId] ?? emptyHistoryEvidence(null)
    const p = (key: string) => percentileFor(player, candidate => marketProbability(candidate, key), players)
    const metric = (getter: (candidate: MarketDnaPlayer) => number | null, higher = true) => percentileFor(player, getter, players, higher)

    const market = average([
      p('fhr'), p('hr'), metric(candidate => candidate.metrics.fhrToHr, false),
      metric(candidate => candidate.metrics.fhrVsAveragePct, false),
      metric(candidate => candidate.metrics.hrVsAveragePct, false),
    ])
    const settlement = average([
      p('hrMl'), p('rbi1'), p('rbi2'), p('rbi3'), p('tb4'), p('tb5'), p('hrr'),
      metric(candidate => candidate.metrics.hrToRbi, false),
      metric(candidate => candidate.metrics.hrToRbi2, false),
      metric(candidate => candidate.metrics.hrToRbi3, false),
      metric(candidate => candidate.metrics.hrToHrr, false),
      metric(candidate => candidate.metrics.hrToHrMl, false),
    ])
    const secondaryMove = average(['hrMl', 'rbi1', 'rbi2', 'rbi3', 'tb4', 'tb5', 'hrr'].map(key => marketMove(player, key)), 0)
    const powerMove = average([marketMove(player, 'fhr'), marketMove(player, 'hr')], 0)
    const contrast = secondaryMove - powerMove
    const movement = average([
      metric(candidate => average(['hrMl', 'rbi1', 'rbi2', 'rbi3', 'tb4', 'tb5', 'hrr'].map(key => marketMove(candidate, key)), 0)),
      metric(candidate => {
        const secondary = average(['hrMl', 'rbi1', 'rbi2', 'rbi3', 'tb4', 'tb5', 'hrr'].map(key => marketMove(candidate, key)), 0)
        return secondary - average([marketMove(candidate, 'fhr'), marketMove(candidate, 'hr')], 0)
      }),
    ])
    const historical = average([
      percentileFor(player, candidate => evidenceByMlbId[candidate.mlbId]?.profileProbability ?? null, players),
      percentileFor(player, candidate => evidenceByMlbId[candidate.mlbId]?.lift ?? null, players),
      percentileFor(player, candidate => evidenceByMlbId[candidate.mlbId]?.samePlayerLift ?? null, players),
      evidence.confidence * 100,
    ])
    const launchShape = player.metrics.avgLaL5 == null ? null : 100 - Math.min(100, Math.abs(player.metrics.avgLaL5 - 22) * 5)
    const statcast = average([
      metric(candidate => candidate.metrics.avgEvL5),
      metric(candidate => candidate.metrics.hardHitL5),
      metric(candidate => candidate.metrics.barrelL10),
      metric(candidate => candidate.metrics.pullAirL5),
      launchShape,
    ])
    const trafficPlayers = previousBatters(game, player)
    const trafficRaw = average(trafficPlayers.flatMap(candidate => [
      marketProbability(candidate, 'hits1'), marketProbability(candidate, 'runs1'), marketProbability(candidate, 'hrr'),
    ]), .25)
    const traffic = percentileFor(player, candidate => {
      const preceding = previousBatters(game, candidate)
      return average(preceding.flatMap(previous => [marketProbability(previous, 'hits1'), marketProbability(previous, 'runs1'), marketProbability(previous, 'hrr')]), .25)
    }, players)
    const hrPickShare = allHrPicks > 0 ? (player.picks.home_runs ?? 0) / allHrPicks : null
    const publicLeverage = hrPickShare == null
      ? 50
      : clamp((market / 100) * 70 + (1 - hrPickShare) * 30, 0, 100)
    const components = { market, settlement, movement, historical, statcast, traffic, publicLeverage }
    const coherence = Math.sqrt(Math.max(0, market * settlement))
    const score = market * .20 + settlement * .20 + coherence * .06 + movement * .07 + historical * .24 + statcast * .10 + traffic * .07 + publicLeverage * .06
    const signals: string[] = []
    const contradictions: string[] = []
    if (market >= 75) signals.push('Top-tier FHR and anytime market position')
    if (settlement >= 70) signals.push('RBI, total-base and team-win stack separates')
    if (contrast > .2) signals.push('Secondary settlement markets strengthened more than headline power')
    if (historical >= 65) signals.push('Comparable archived profiles cleared HR above their pool')
    if (evidence.samePlayerLift != null && evidence.samePlayerLift >= 1.15) signals.push('This player has cleared HR above their own baseline in similar prior profiles')
    if ((evidence.settlementShape.multiRbiHrRate ?? 0) >= .45 && p('rbi2') >= 60) signals.push('Historical analogs and today\'s RBI ladder support a multi-RBI HR shape')
    if (statcast >= 70) signals.push('Recent contact shape supports the price structure')
    if (traffic >= 70) signals.push('Preceding lineup slots carry strong on-base and run pricing')
    if (publicLeverage >= 72 && allHrPicks > 0) signals.push('Market strength exceeds public HR share')
    if (player.metrics.avgLaL5 != null && (player.metrics.avgLaL5 < 8 || player.metrics.avgLaL5 > 38)) contradictions.push('Recent launch shape is outside the strongest HR band')
    if (statcast < 35) contradictions.push('Recent Statcast support is weak')
    if (marketMove(player, 'hr') != null && marketMove(player, 'hr')! < -1) contradictions.push('Anytime price moved materially longer')
    if (!signals.length) signals.push('Composite strength comes from several moderate edges')
    return { rank: 0, score, gapFromLeader: 0, player, components, signals, contradictions, historical: evidence, outcome: null, trafficRaw }
  })
  const sorted = preliminary.sort((a, b) => b.score - a.score)
  const leader = sorted[0]?.score ?? 0
  return sorted.map((entry, index) => ({
    rank: index + 1,
    score: Math.round(entry.score * 10) / 10,
    gapFromLeader: Math.round((leader - entry.score) * 10) / 10,
    player: entry.player,
    components: entry.components,
    signals: entry.signals,
    contradictions: entry.contradictions,
    historical: entry.historical,
    outcome: null,
  }))
}

async function fetchGameScore(gamePk: number) {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return null
    const body = await response.json()
    return {
      away: Number(body?.liveData?.linescore?.teams?.away?.runs ?? 0),
      home: Number(body?.liveData?.linescore?.teams?.home?.runs ?? 0),
    }
  } catch {
    return null
  }
}

async function loadHistoricalRowsForGames(games: MarketDnaGame[]) {
  const hrPrices = games.flatMap(game => game.players.map(player => marketByKey(player, 'hr')?.current)).filter((value): value is number => value != null)
  if (!hrPrices.length) throw new Error('The selected board has no captured Anytime HR market.')
  const cutoff = games.map(game => game.gameDate).sort()[0]
  const query = `/rest/v1/player_outcomes?select=${HISTORICAL_SELECT}&game_date=lt.${cutoff}&odds_hr_best=not.is.null&odds_hr_best=gte.${Math.max(100, Math.floor(Math.min(...hrPrices) * .42))}&odds_hr_best=lte.${Math.min(6000, Math.ceil(Math.max(...hrPrices) * 2.35 + 100))}&batting_order=gte.1&batting_order=lte.9&order=game_date.desc`
  return mpGetAll(query, 20_000)
}

function rankGameWithHistory(game: MarketDnaGame, rows: HistoricalRow[]) {
  const evidenceByMlbId: Record<number, GameHistoryEvidence> = {}
  for (const player of game.players) evidenceByMlbId[player.mlbId] = buildHistoryEvidence(player, rows, game)
  return rankMarketDnaGameProfiles(game, evidenceByMlbId)
}

function attachGameOutcomes(
  game: MarketDnaGame,
  ranking: MarketDnaGameRank[],
  outcomes: Record<number, MlbBatterOutcome>,
  hrEvents: Awaited<ReturnType<typeof fetchHrFeed>>['hrFeed'],
  score: { away: number; home: number } | null,
) {
  const firstHrId = hrEvents.find(event => event.game_pk === game.gamePk && event.is_first_hr_of_game)?.mlb_id ?? null
  const hrCountById = new Map<number, number>()
  for (const event of hrEvents.filter(event => event.game_pk === game.gamePk && event.mlb_id != null)) hrCountById.set(event.mlb_id!, (hrCountById.get(event.mlb_id!) ?? 0) + 1)
  const winningTeam = score == null || score.away === score.home ? null : score.away > score.home ? game.awayAbbr : game.homeAbbr
  return ranking.map(entry => {
    const result = outcomes[entry.player.mlbId]
    return {
      ...entry,
      outcome: result ? { ...result, firstHr: entry.player.mlbId === firstHrId, hrMlWon: result.hr > 0 && entry.player.team === winningTeam, hrEvents: hrCountById.get(entry.player.mlbId) ?? result.hr } : null,
    }
  })
}

function buildGameAnalysis(
  game: MarketDnaGame,
  ranking: MarketDnaGameRank[],
  sourceRows: number,
  score: { away: number; home: number } | null,
): MarketDnaGameAnalysis {
  const outcomeAvailable = game.players.some(player => player.gameStarted)
  const actualHomeRuns = ranking.filter(entry => (entry.outcome?.hr ?? 0) > 0).map(entry => ({
    mlbId: entry.player.mlbId,
    name: entry.player.name,
    team: entry.player.team,
    firstHr: Boolean(entry.outcome?.firstHr),
    homeRuns: entry.outcome?.hr ?? 0,
    rbis: entry.outcome?.rbi ?? 0,
    totalBases: entry.outcome?.tb ?? 0,
    hrMlWon: Boolean(entry.outcome?.hrMlWon),
    pregameRank: entry.rank,
  }))
  return {
    generatedAt: new Date().toISOString(),
    stage: outcomeAvailable ? 'frozen_close' : 'current',
    game,
    ranking,
    separation: ranking.length > 1 ? Math.round((ranking[0].score - ranking[1].score) * 10) / 10 : 0,
    sourceRows,
    outcomeAvailable,
    score,
    actualHomeRuns,
  }
}

export async function analyzeMarketDnaGame(game: MarketDnaGame): Promise<MarketDnaGameAnalysis> {
  const rows = await loadHistoricalRowsForGames([game])
  let ranking = rankGameWithHistory(game, rows)

  const gameStarted = game.players.some(player => player.gameStarted)
  let score: { away: number; home: number } | null = null
  if (gameStarted) {
    const ref = [{ gamePk: game.gamePk, status: { abstractGameState: /final/i.test(game.status) ? 'Final' : 'Live' } }]
    const [outcomesByGame, hrResult, gameScore] = await Promise.all([fetchBoxscoreOutcomes(ref), fetchHrFeed(ref), fetchGameScore(game.gamePk)])
    score = gameScore
    ranking = attachGameOutcomes(game, ranking, outcomesByGame[game.gamePk] ?? {}, hrResult.hrFeed, score)
  }
  return buildGameAnalysis(game, ranking, rows.length, score)
}

export async function analyzeMarketDnaSlate(date: string, games: MarketDnaGame[]): Promise<MarketDnaSlateAudit> {
  const capturedGames = games.filter(game => game.players.length >= 18)
  if (!capturedGames.length) throw new Error('No complete 18-player boards were captured for this date.')
  const rows = await loadHistoricalRowsForGames(capturedGames)
  const refs = capturedGames.map(game => ({
    gamePk: game.gamePk,
    status: { abstractGameState: game.players.some(player => player.gameStarted) ? (/final/i.test(game.status) ? 'Final' : 'Live') : 'Preview' },
  }))
  const [outcomesByGame, hrResult, scores] = await Promise.all([
    fetchBoxscoreOutcomes(refs),
    fetchHrFeed(refs),
    Promise.all(capturedGames.map(game => fetchGameScore(game.gamePk))),
  ])
  const analyses = capturedGames.map((game, index) => {
    let ranking = rankGameWithHistory(game, rows)
    if (game.players.some(player => player.gameStarted)) ranking = attachGameOutcomes(game, ranking, outcomesByGame[game.gamePk] ?? {}, hrResult.hrFeed, scores[index])
    return buildGameAnalysis(game, ranking, rows.length, scores[index])
  })
  const completed = analyses.filter(analysis => /final/i.test(analysis.game.status))
  const withHr = completed.filter(analysis => analysis.actualHomeRuns.length > 0)
  const allRanks = withHr.flatMap(analysis => analysis.actualHomeRuns.map(result => result.pregameRank).filter((rank): rank is number => rank != null))
  const bestRanks = withHr.map(analysis => Math.min(...analysis.actualHomeRuns.map(result => result.pregameRank ?? 99)))
  const perfectSeparationGames = withHr.filter(analysis => {
    const homerScores = analysis.ranking.filter(entry => (entry.outcome?.hr ?? 0) > 0).map(entry => entry.score)
    const nonHomerScores = analysis.ranking.filter(entry => (entry.outcome?.hr ?? 0) === 0).map(entry => entry.score)
    return homerScores.length > 0 && nonHomerScores.length > 0 && Math.min(...homerScores) > Math.max(...nonHomerScores)
  }).length
  return {
    generatedAt: new Date().toISOString(),
    date,
    games: analyses,
    summary: {
      completedGames: completed.length,
      gamesWithHomeRun: withHr.length,
      leaderHitGames: withHr.filter(analysis => analysis.actualHomeRuns.some(result => result.pregameRank === 1)).length,
      topTwoHitGames: withHr.filter(analysis => analysis.actualHomeRuns.some(result => (result.pregameRank ?? 99) <= 2)).length,
      perfectSeparationGames,
      averageBestHomerRank: bestRanks.length ? bestRanks.reduce((sum, rank) => sum + rank, 0) / bestRanks.length : null,
      averageAllHomerRank: allRanks.length ? allRanks.reduce((sum, rank) => sum + rank, 0) / allRanks.length : null,
    },
  }
}

function scoreMatch(player: MarketDnaPlayer, row: HistoricalRow, game?: MarketDnaGame): HistoricalMatch | null {
  const features = featuresFor(player, row, game)
  const available = features.filter(item => item.current != null && item.historical != null)
  if (available.length < 4) return null
  const possibleWeight = features.filter(item => item.current != null).reduce((sum, item) => sum + item.weight, 0)
  let weightedDistance = 0
  let usedWeight = 0
  const details = available.map(item => {
    const distance = clamp(Math.abs(item.current! - item.historical!) / item.scale, 0, 2)
    weightedDistance += distance * item.weight
    usedWeight += item.weight
    return { label: item.label, distance }
  }).sort((a, b) => a.distance - b.distance)
  const coverage = possibleWeight > 0 ? usedWeight / possibleWeight : 0
  const distance = usedWeight > 0 ? weightedDistance / usedWeight : 2
  const similarity = clamp((1 - distance / 1.35) * (0.78 + coverage * 0.22))
  return {
    playerName: row.player_name,
    team: row.team_abbr,
    gameDate: row.game_date,
    gamePk: row.game_pk,
    similarity,
    coverage,
    didHr: Boolean(row.did_hr),
    hits: asNumber(row.hits),
    runs: asNumber(row.runs),
    rbis: asNumber(row.rbis),
    totalBases: asNumber(row.total_bases),
    stolenBases: asNumber(row.stolen_bases),
    didDouble: Boolean(row.did_double),
    didTriple: Boolean(row.did_triple),
    battingOrder: asNumber(row.batting_order),
    hrOdds: historicalPrice(row, 'odds_hr_close', 'fd_hr', 'odds_hr_best'),
    fhrOdds: historicalPrice(row, 'odds_first_hr_best'),
    strongestMatches: details.slice(0, 4).map(item => item.label),
    largestDifferences: details.slice(-3).reverse().map(item => item.label),
  }
}

export async function analyzeMarketDna(player: MarketDnaPlayer): Promise<MarketDnaAnalysis> {
  const hrOdds = marketByKey(player, 'hr')?.current
  if (hrOdds == null) throw new Error('This player does not have an Anytime HR price in the captured board.')
  const lowOdds = Math.max(100, Math.floor(hrOdds * 0.42))
  const highOdds = Math.min(6000, Math.ceil(hrOdds * 2.35 + 100))
  const minOrder = Math.max(1, player.battingOrder - 3)
  const maxOrder = Math.min(9, player.battingOrder + 3)
  const query = `/rest/v1/player_outcomes?select=${HISTORICAL_SELECT}&game_date=lt.${player.gameDate}&odds_hr_best=not.is.null&odds_hr_best=gte.${lowOdds}&odds_hr_best=lte.${highOdds}&batting_order=gte.${minOrder}&batting_order=lte.${maxOrder}&order=game_date.desc`
  const rows = await mpGetAll(query)
  const matches = rows.map(row => scoreMatch(player, row)).filter((row): row is HistoricalMatch => row != null).sort((a, b) => b.similarity - a.similarity)
  const sameRows = rows.filter(row => (row.name_norm || normName(row.player_name)) === player.nameNorm)
  const sameMatches = sameRows.map(row => scoreMatch(player, row)).filter((row): row is HistoricalMatch => row != null).sort((a, b) => b.similarity - a.similarity)
  const rowsByKey = new Map(rows.map(row => [rowKey(row), row]))
  const top10Rows = matches.slice(0, 10).map(match => rowsByKey.get(matchKey(match))).filter((row): row is HistoricalRow => Boolean(row))
  const top25Rows = matches.slice(0, 25).map(match => rowsByKey.get(matchKey(match))).filter((row): row is HistoricalRow => Boolean(row))
  const matchedSameRows = sameMatches.slice(0, 12).map(match => rowsByKey.get(matchKey(match))).filter((row): row is HistoricalRow => Boolean(row))
  const top25Rate = rate(top25Rows)
  const poolRate = rate(rows)
  const lift = top25Rate != null && poolRate != null && poolRate > 0 ? top25Rate / poolRate : null
  const profileCoverage = matches[0]?.coverage ?? 0
  const nearestSimilarity = matches[0]?.similarity ?? null
  const summary = matches.length < 10
    ? 'Historical coverage is too thin for a stable profile read.'
    : lift != null && lift >= 1.35
      ? 'The nearest historical profiles produced home runs materially more often than this comparison pool.'
      : lift != null && lift <= 0.75
        ? 'The nearest historical profiles produced home runs less often than this comparison pool.'
        : 'The nearest historical profiles are close to the comparison pool home-run rate.'
  return {
    generatedAt: new Date().toISOString(),
    sourceRows: rows.length,
    stage: player.gameStarted ? 'frozen_close' : 'current',
    player,
    samePlayer: {
      matches: sameMatches.slice(0, 12),
      matchedHrRate: rate(matchedSameRows),
      careerHrRate: rate(sameRows),
      sample: sameRows.length,
    },
    leagueAnalogs: {
      matches: matches.slice(0, 18),
      top10HrRate: rate(top10Rows),
      top25HrRate: top25Rate,
      poolHrRate: poolRate,
      sample: matches.length,
    },
    read: { profileCoverage, nearestSimilarity, historicalHrLift: lift, summary },
  }
}
