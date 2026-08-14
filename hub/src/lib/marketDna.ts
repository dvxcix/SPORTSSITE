import { normName } from '@slipsurge/core/nameNorm'
import { computeDugoutSpecsValue, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'
import { fetchHistoricalGameBundles } from '@/lib/matrixBacktest'

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
    hrToRbi: number | null
    hrToRbi2: number | null
    hrToTb4: number | null
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
      hrToRbi: ratio(bundle, 'sa_div_rbi'),
      hrToRbi2: ratio(bundle, 'sa_div_rbi2'),
      hrToTb4: ratio(bundle, 'sa_div_tb4'),
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

function featuresFor(player: MarketDnaPlayer, row: HistoricalRow): Feature[] {
  const market = (key: string) => marketByKey(player, key)?.current ?? null
  const move = (key: string) => marketByKey(player, key)?.probabilityMove ?? null
  const historicalHr = historicalPrice(row, 'odds_hr_close', 'fd_hr', 'odds_hr_best')
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
    feature('FHR vs player baseline', 'structure', player.metrics.fhrVsAveragePct == null ? null : player.metrics.fhrVsAveragePct * 100, asNumber(row.fhr_div_pct), 25, 1.15),
    feature('HR vs player baseline', 'structure', player.metrics.hrVsAveragePct == null ? null : player.metrics.hrVsAveragePct * 100, asNumber(row.hr_div_pct), 25, 1.15),
    feature('HR to RBI ratio', 'structure', player.metrics.hrToRbi, asNumber(row.hr_rbi_ratio), 0.55, 1.25),
    feature('Batting order', 'context', player.battingOrder, asNumber(row.batting_order), 3, 0.8),
    feature('Barrel rate', 'statcast', player.metrics.barrelL10, asNumber(row.brl_pct), 15, 1.15),
    feature('Hard-hit rate', 'statcast', player.metrics.hardHitL5, asNumber(row.hard_hit_pct), 22, 1),
    feature('Exit velocity', 'statcast', player.metrics.avgEvL5, asNumber(row.exit_velo), 8, 0.8),
    feature('Launch angle', 'statcast', player.metrics.avgLaL5, asNumber(row.launch_angle), 14, 0.55),
  ]
}

function scoreMatch(player: MarketDnaPlayer, row: HistoricalRow): HistoricalMatch | null {
  const features = featuresFor(player, row)
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
