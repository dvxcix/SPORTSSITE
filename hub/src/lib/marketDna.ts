import { normName } from '@slipsurge/core/nameNorm'
import { computeDugoutSpecsValue, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'
import { fetchHistoricalGameBundles } from '@/lib/matrixBacktest'
import { attachCanonicalMmToBundles } from '@/lib/hrIntelligenceData'
import { computeDugoutPercentValue } from '@/lib/dugoutPercentColor'
import { fetchBoxscoreOutcomes, type MlbBatterOutcome } from '@/lib/mlbBoxscoreOutcomes'
import { fetchHrFeed } from '@/lib/hrFeed'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeGameMechanicsWindows, MECHANICS_WINDOWS, type GameMechanicsWindows } from '@/lib/hrMechanics'
import { precomputeDugoutStatcastForDate } from '@/lib/dugoutStatcastPrecompute'
import { precomputeDugoutPitchlogStatForDate } from '@/lib/dugoutPitchlogStatPrecompute'
import { precomputeMatchupEdgeForDate } from '@/lib/dugoutMatchupEdgePrecompute'
import {
  projectMarketDnaGame,
  scoreMarketDnaLaneVector,
  scoreMarketDnaVector,
  trainMarketDnaRanker,
  type MarketDnaGameProjection,
  type MarketDnaLaneScores,
  type MarketDnaRankerArtifact,
  type MarketDnaRankerValidation,
} from '@/lib/marketDnaRanker'

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
    dugoutFhrPct: number | null
    dugoutHrPct: number | null
    fhrDelta: number | null
    fhrWeightedDelta: number | null
    hrDelta: number | null
    mmL1: number | null
    mmL3: number | null
    mmL5: number | null
    mmL10: number | null
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
    mechanics: Record<'l1' | 'l3' | 'l5' | 'l10', {
      index: number
      rank: number
      confidence: number
      power: number
      transfer: number
      plane: number
      timing: number
      trajectory: number
      pitcher: number
      trend: number
    } | null>
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
  sourceWarnings?: string[]
  noHr: { current: number | null; open: number | null; probabilityMove: number | null }
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
  mechanics: number
  traffic: number
  publicLeverage: number
}

export type MarketDnaGameRank = {
  rank: number
  score: number
  profileScore: number
  learnedProbability: number | null
  laneScores: MarketDnaLaneScores
  selectedLane: 'primary' | 'secondary' | 'conditional' | 'market-guard' | null
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
  projection: MarketDnaGameProjection | null
  readState: 'clear' | 'conditional' | 'pass'
  candidates: Array<{
    tier: 'primary' | 'secondary' | 'conditional'
    label: string
    score: number
    learnedRank: number
    player: MarketDnaPlayer
    reasons: string[]
  }>
  reducer: {
    version: string
    trainedThrough: string
    trainingRows: number
    validation: MarketDnaRankerValidation | null
  } | null
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
    candidateCoverageGames: number
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

type CanonicalFeatureVector = Record<string, number>

type ArchivedProfileRow = {
  game_date: string
  game_pk: number
  mlb_id: number
  player_name: string
  name_norm: string
  team_abbr: string
  batting_order: number
  profile: MarketDnaPlayer
  feature_vector: CanonicalFeatureVector
  did_hr: boolean
  home_runs: number
  hits: number
  runs: number
  rbis: number
  total_bases: number
  stolen_bases: number
  did_double: boolean
  did_triple: boolean
  first_hr: boolean
  hr_ml_won: boolean
  source_version?: string | null
  updated_at?: string | null
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
  mechanicsWindows: GameMechanicsWindows | null,
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
  const fhrCurrent = currentPrice(props, 'fhr')
  const hrCurrent = currentPrice(props, 'sa')
  const fhrAverage = asNumber(bundle.fhrAvg?.fd)
  const hrAverage = asNumber(bundle.saAvg?.fd) ?? asNumber(bundle.saAvg?.cz)
  const fhrDelta = fhrCurrent != null && fhrAverage != null ? fhrCurrent - fhrAverage : null
  const hrDelta = hrCurrent != null && hrAverage != null ? hrCurrent - hrAverage : null
  const lineupsConfirmed = game.game.awayLineupConfirmed && game.game.homeLineupConfirmed
  const boardRank = lineupsConfirmed
    ? (team === game.game.homeAbbr ? 9 : 0) + player.batting_order
    : null
  const fhrWeightedDelta = fhrDelta == null
    ? null
    : boardRank == null
      ? fhrDelta
      : fhrDelta * (0.75 + ((boardRank - 1) / 17) * 0.75)
  const mechanics = Object.fromEntries(MECHANICS_WINDOWS.map(window => {
    const scored = mechanicsWindows?.[window]?.players.find(candidate => candidate.playerId === player.mlb_id)
    return [`l${window}`, scored ? {
      index: scored.scores.overall,
      rank: scored.rank,
      confidence: scored.scores.confidence,
      power: scored.scores.powerFormation,
      transfer: scored.scores.transferEfficiency,
      plane: scored.scores.planeMatch,
      timing: scored.scores.timing,
      trajectory: scored.scores.trajectory,
      pitcher: scored.scores.pitcherBreakdown,
      trend: scored.scores.trend,
    } : null]
  })) as MarketDnaPlayer['metrics']['mechanics']
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
      dugoutFhrPct: computeDugoutPercentValue(fhrCurrent, fhrAverage),
      dugoutHrPct: computeDugoutPercentValue(hrCurrent, hrAverage),
      fhrDelta,
      fhrWeightedDelta,
      hrDelta,
      mmL1: asNumber(bundle.mmByWindow?.l1),
      mmL3: asNumber(bundle.mmByWindow?.l3),
      mmL5: asNumber(bundle.mmByWindow?.l5),
      mmL10: asNumber(bundle.mmByWindow?.l10),
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
      mechanics,
    },
  }
}

export async function buildMarketDnaSlate(
  date: string,
  options: { strictPregameFeatures?: boolean; useTargetPregameCache?: boolean } = {},
): Promise<{ date: string; games: MarketDnaGame[] }> {
  const bundles = await fetchHistoricalGameBundles(date, { requirePikkit: true, strictPregameFeatures: options.strictPregameFeatures })
  await attachCanonicalMmToBundles(bundles, date, options)
  const mechanicsByGame = new Map<number, GameMechanicsWindows | null>()
  await Promise.all(bundles.map(async bundle => {
    try {
      mechanicsByGame.set(bundle.game.gamePk, await computeGameMechanicsWindows(bundle.game, date, options))
    } catch {
      mechanicsByGame.set(bundle.game.gamePk, null)
    }
  }))
  return {
    date,
    games: bundles.map(game => {
      const players = [
        ...game.game.awayLineup.flatMap(player => {
          const bundle = game.awayBundle.get(normName(player.name))
          return bundle ? [buildPlayerProfile(date, game, player, bundle, game.game.awayAbbr, game.game.homeAbbr, game.game.homePitcher, mechanicsByGame.get(game.game.gamePk) ?? null)] : []
        }),
        ...game.game.homeLineup.flatMap(player => {
          const bundle = game.homeBundle.get(normName(player.name))
          return bundle ? [buildPlayerProfile(date, game, player, bundle, game.game.homeAbbr, game.game.awayAbbr, game.game.awayPitcher, mechanicsByGame.get(game.game.gamePk) ?? null)] : []
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
        sourceWarnings: game.sourceWarnings,
        noHr: {
          current: game.noHr.current,
          open: game.noHr.open,
          probabilityMove: probabilityMove(game.noHr.current, game.noHr.open),
        },
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

function adjacentBatters(game: MarketDnaGame, player: MarketDnaPlayer) {
  const lineup = game.players.filter(candidate => candidate.team === player.team)
  const byOrder = new Map(lineup.map(candidate => [candidate.battingOrder, candidate]))
  const at = (offset: number) => byOrder.get(((player.battingOrder + offset - 1 + 9) % 9) + 1) ?? null
  return { previous: at(-1), next: at(1) }
}

function normalizedSigned(value: number | null, scale: number, center = 0) {
  return value == null ? null : clamp(.5 + Math.atan((value - center) / scale) / Math.PI)
}

export function canonicalFeatureVector(player: MarketDnaPlayer, game: MarketDnaGame): CanonicalFeatureVector {
  const vector: CanonicalFeatureVector = {}
  const put = (key: string, value: number | null | undefined) => {
    if (value != null && Number.isFinite(value)) vector[key] = clamp(value)
  }
  put('game.noHr.probability', implied(game.noHr.current))
  put('game.noHr.movement', normalizedSigned(game.noHr.probabilityMove, 2.5))
  for (const market of player.markets) {
    put(`market.${market.key}.probability`, implied(market.current))
    put(`market.${market.key}.rank`, percentileFor(player, candidate => marketProbability(candidate, market.key), game.players) / 100)
    put(`market.${market.key}.movement`, normalizedSigned(market.probabilityMove, 2.5))
  }
  const totalByPick = Object.fromEntries(PICK_KEYS.map(key => [key, game.players.reduce((sum, candidate) => sum + (candidate.picks[key] ?? 0), 0)])) as Record<string, number>
  for (const key of PICK_KEYS) {
    const total = totalByPick[key]
    put(`public.${key}.share`, total > 0 ? (player.picks[key] ?? 0) / total : null)
    put(`public.${key}.rank`, percentileFor(player, candidate => candidate.picks[key] ?? 0, game.players) / 100)
  }
  const totalHrProbability = game.players.reduce((sum, candidate) => sum + (marketProbability(candidate, 'hr') ?? 0), 0)
  const expectedHrShare = totalHrProbability > 0 ? (marketProbability(player, 'hr') ?? 0) / totalHrProbability : null
  const actualHrShare = totalByPick.home_runs > 0 ? (player.picks.home_runs ?? 0) / totalByPick.home_runs : null
  if (expectedHrShare != null && actualHrShare != null) {
    put('public.home_runs.expectedShare', expectedHrShare)
    put('public.home_runs.hiddenResidual', normalizedSigned(expectedHrShare - actualHrShare, .035))
    put('public.home_runs.expectedActualRatio', normalizedSigned(Math.log((expectedHrShare + .005) / (actualHrShare + .005)), 1.25))
  }
  type SimilarityMetric = Exclude<keyof MarketDnaPlayer['metrics'], 'dugoutFhrPct' | 'dugoutHrPct' | 'fhrDelta' | 'fhrWeightedDelta' | 'hrDelta' | 'mmL1' | 'mmL3' | 'mmL5' | 'mmL10' | 'mechanics'>
  const metricScales: Record<SimilarityMetric, [number, number]> = {
    fhrVsAveragePct: [25, 0], hrVsAveragePct: [25, 0], fhrToHr: [.5, 1], mgmToFd: [.35, 1],
    paToHr: [.7, 1], hrToRbi: [.5, 1], hrToRbi2: [.8, 1], hrToRbi3: [1.2, 1],
    hrToHrr: [.5, 1], hrToTb2: [.5, 1], hrToTb3: [.6, 1], hrToTb4: [.8, 1],
    hrToTb5: [1, 1], hrToHr2: [1, 1], hrToHrMl: [.5, 1], precisionHrScore: [1, 0],
    avgEvL5: [8, 88], avgLaL5: [14, 22], hardHitL5: [20, 40], barrelL10: [10, 10],
    pullAirL5: [18, 25], batSpeedL5: [8, 70],
  }
  for (const key of Object.keys(metricScales) as SimilarityMetric[]) {
    const [scale, center] = metricScales[key]
    put(`metric.${key}.value`, normalizedSigned(player.metrics[key], scale, center))
    put(`metric.${key}.rank`, percentileFor(player, candidate => candidate.metrics[key], game.players) / 100)
  }
  for (const window of [1, 3, 5, 10] as const) {
    const mmKey = `mmL${window}` as 'mmL1' | 'mmL3' | 'mmL5' | 'mmL10'
    const mm = player.metrics[mmKey]
    put(`metric.mmL${window}.value`, normalizedSigned(mm, 6))
    put(`metric.mmL${window}.rank`, percentileFor(player, candidate => candidate.metrics[mmKey], game.players) / 100)
    put(`metric.mmL${window}.positive`, mm == null ? null : mm > 0 ? 1 : mm < 0 ? 0 : .5)
    put(`metric.mmL${window}.neutral`, mm == null ? null : Math.abs(mm) < .5 ? 1 : 0)
    const mechanics = player.metrics.mechanics[`l${window}`]
    for (const key of ['index', 'confidence', 'power', 'transfer', 'plane', 'timing', 'trajectory', 'pitcher', 'trend'] as const) {
      put(`mechanics.l${window}.${key}`, mechanics?.[key] == null ? null : mechanics[key] / 100)
      put(`mechanics.l${window}.${key}.rank`, percentileFor(
        player,
        candidate => candidate.metrics.mechanics[`l${window}`]?.[key] ?? null,
        game.players,
      ) / 100)
    }
    put(`mechanics.l${window}.gameRank`, mechanics == null ? null : 1 - ((mechanics.rank - 1) / Math.max(1, game.players.length - 1)))
  }
  const baselineGap = player.metrics.fhrVsAveragePct == null || player.metrics.hrVsAveragePct == null
    ? null
    : player.metrics.fhrVsAveragePct - player.metrics.hrVsAveragePct
  put('structure.fhrHrBaselineGap', normalizedSigned(baselineGap, 18))
  put('structure.fhrHrBaselineConvergence', baselineGap == null ? null : 1 - clamp(Math.abs(baselineGap) / 50))
  put('structure.fhrMoveVsHrMove', normalizedSigned(
    marketMove(player, 'fhr') == null || marketMove(player, 'hr') == null ? null : marketMove(player, 'fhr')! - marketMove(player, 'hr')!,
    2.5,
  ))
  put('context.battingOrder', (player.battingOrder - 1) / 8)
  const preceding = previousBatters(game, player)
  put('context.traffic', average(preceding.flatMap(candidate => [marketProbability(candidate, 'hits1'), marketProbability(candidate, 'runs1'), marketProbability(candidate, 'hrr')]), .25))
  const adjacent = adjacentBatters(game, player)
  const adjacentPlayers = [adjacent.previous, adjacent.next].filter((candidate): candidate is MarketDnaPlayer => candidate != null)
  put('context.adjacentPowerPressure', average(adjacentPlayers.flatMap(candidate => [
    marketProbability(candidate, 'fhr'), marketProbability(candidate, 'hr'),
  ]), .15))
  put('context.previousHrContrast', normalizedSigned(
    adjacent.previous == null || marketProbability(player, 'hr') == null || marketProbability(adjacent.previous, 'hr') == null
      ? null
      : marketProbability(player, 'hr')! - marketProbability(adjacent.previous, 'hr')!,
    .05,
  ))
  put('context.nextHrContrast', normalizedSigned(
    adjacent.next == null || marketProbability(player, 'hr') == null || marketProbability(adjacent.next, 'hr') == null
      ? null
      : marketProbability(player, 'hr')! - marketProbability(adjacent.next, 'hr')!,
    .05,
  ))
  const fhrPrice = marketByKey(player, 'fhr')?.current ?? null
  const fhrNeighbors = fhrPrice == null ? [] : game.players.filter(candidate => candidate.mlbId !== player.mlbId && marketByKey(candidate, 'fhr')?.current != null)
  const nearestFhrDistance = fhrPrice == null || !fhrNeighbors.length
    ? null
    : Math.min(...fhrNeighbors.map(candidate => Math.abs((marketByKey(candidate, 'fhr')?.current ?? fhrPrice) - fhrPrice)))
  put('context.fhrClusterDensity', nearestFhrDistance == null ? null : 1 - clamp(nearestFhrDistance / 400))
  put('context.fhrExactTie', fhrPrice == null ? null : fhrNeighbors.some(candidate => marketByKey(candidate, 'fhr')?.current === fhrPrice) ? 1 : 0)
  return vector
}

function canonicalFeatureWeight(key: string) {
  if (key === 'context.battingOrder') return .45
  if (key === 'context.traffic') return .9
  if (key.endsWith('.rank')) return 1.25
  if (key.endsWith('.movement')) return 1.05
  if (key.startsWith('public.')) return .8
  if (key.startsWith('metric.')) return 1.05
  if (/rbi|tb4|tb5|hrr|hrMl|pa1|laser|moonshot/.test(key)) return 1.2
  if (/fhr|\.hr\./.test(key)) return 1.45
  return 1
}

function canonicalSimilarity(current: CanonicalFeatureVector, historical: CanonicalFeatureVector) {
  let similarity = 0
  let weight = 0
  let possibleWeight = 0
  const keys = new Set([...Object.keys(current), ...Object.keys(historical)])
  for (const key of keys) {
    const featureWeight = canonicalFeatureWeight(key)
    possibleWeight += featureWeight
    if (current[key] == null || historical[key] == null) continue
    similarity += (1 - Math.abs(current[key] - historical[key])) * featureWeight
    weight += featureWeight
  }
  return {
    similarity: weight ? clamp(similarity / weight) : 0,
    coverage: possibleWeight ? clamp(weight / possibleWeight) : 0,
  }
}

function gameFeatureSignature(vectors: CanonicalFeatureVector[]) {
  const signature: CanonicalFeatureVector = {}
  const keys = new Set(vectors.flatMap(vector => Object.keys(vector)))
  for (const key of keys) {
    if (key.endsWith('.rank') || key === 'context.battingOrder') continue
    const values = vectors.map(vector => vector[key]).filter((value): value is number => value != null)
    if (values.length < Math.max(6, vectors.length / 2)) continue
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
    signature[`game.mean.${key}`] = mean
    signature[`game.spread.${key}`] = clamp(Math.sqrt(variance) * 2)
    signature[`game.high.${key}`] = Math.max(...values)
    signature[`game.low.${key}`] = Math.min(...values)
  }
  return signature
}

function selectComparableGameRows(game: MarketDnaGame, rows: ArchivedProfileRow[]) {
  if (!rows.length) return rows
  const currentSignature = gameFeatureSignature(game.players.map(player => canonicalFeatureVector(player, game)))
  const byGame = new Map<number, ArchivedProfileRow[]>()
  for (const row of rows) byGame.set(row.game_pk, [...(byGame.get(row.game_pk) ?? []), row])
  return [...byGame.values()]
    .filter(gameRows => gameRows.length >= 18)
    .map(gameRows => ({ gameRows, ...canonicalSimilarity(currentSignature, gameFeatureSignature(gameRows.map(row => row.feature_vector))) }))
    .filter(entry => entry.coverage >= .45)
    .sort((a, b) => (b.similarity * b.coverage) - (a.similarity * a.coverage))
    .slice(0, 72)
    .flatMap(entry => entry.gameRows)
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

function buildCanonicalHistoryEvidence(
  player: MarketDnaPlayer,
  game: MarketDnaGame,
  rows: ArchivedProfileRow[],
  baselineRows: ArchivedProfileRow[] = rows,
): GameHistoryEvidence {
  if (!rows.length) return emptyHistoryEvidence(null)
  const current = canonicalFeatureVector(player, game)
  const scored = rows.map(row => ({ row, ...canonicalSimilarity(current, row.feature_vector) }))
    .filter(entry => entry.coverage >= .55)
    .sort((a, b) => (b.similarity * b.coverage) - (a.similarity * a.coverage))
  const nearest = scored.slice(0, 60)
  const samePlayerPool = baselineRows.filter(row => row.name_norm === player.nameNorm)
  const samePlayer = scored.filter(entry => entry.row.name_norm === player.nameNorm).slice(0, 24)
  const poolHrRate = rows.filter(row => row.did_hr).length / rows.length
  const samePlayerBaselineHrRate = samePlayerPool.length ? samePlayerPool.filter(row => row.did_hr).length / samePlayerPool.length : null
  const posterior = (
    entries: typeof nearest,
    prior: number | null,
    priorWeight: number,
  ) => {
    let hits = (prior ?? 0) * priorWeight
    let weight = prior == null ? 0 : priorWeight
    for (const entry of entries) {
      const sampleWeight = Math.max(.05, Math.pow(entry.similarity, 4) * entry.coverage)
      hits += entry.row.did_hr ? sampleWeight : 0
      weight += sampleWeight
    }
    return weight ? hits / weight : null
  }
  const matchedHrRate = nearest.length ? nearest.filter(entry => entry.row.did_hr).length / nearest.length : null
  const analogPosterior = posterior(nearest, poolHrRate, 10)
  const samePlayerPosterior = posterior(samePlayer, samePlayerBaselineHrRate, 5)
  const samePlayerWeight = samePlayer.length ? clamp(samePlayer.length / 14, .2, .55) : 0
  const profileProbability = analogPosterior == null
    ? samePlayerPosterior
    : samePlayerPosterior == null
      ? analogPosterior
      : analogPosterior * (1 - samePlayerWeight) + samePlayerPosterior * samePlayerWeight
  const lift = profileProbability != null && poolHrRate > 0 ? profileProbability / poolHrRate : null
  const samePlayerLift = samePlayerPosterior != null && samePlayerBaselineHrRate != null && samePlayerBaselineHrRate > 0
    ? samePlayerPosterior / samePlayerBaselineHrRate
    : null
  const nearestHr = nearest.filter(entry => entry.row.did_hr)
  const shapeRate = (predicate: (row: ArchivedProfileRow) => boolean) => nearestHr.length
    ? nearestHr.filter(entry => predicate(entry.row)).length / nearestHr.length
    : null
  const topSimilarity = nearest[0]?.similarity ?? null
  const confidence = clamp(
    average(nearest.slice(0, 20).map(entry => entry.similarity * entry.coverage), 0)
      * (Math.min(1, nearest.length / 45) * .7 + Math.min(1, samePlayer.length / 12) * .3),
  )
  return {
    matchedHrRate,
    poolHrRate,
    lift,
    nearestSimilarity: topSimilarity,
    sample: nearest.length,
    samePlayerHrRate: samePlayerPosterior,
    samePlayerBaselineHrRate,
    samePlayerLift,
    samePlayerSample: samePlayer.length,
    profileProbability,
    confidence,
    settlementShape: {
      multiRbiHrRate: shapeRate(row => row.rbis >= 2),
      fivePlusTbHrRate: shapeRate(row => row.total_bases >= 5),
      soloOrOneRbiHrRate: shapeRate(row => row.rbis <= 1),
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
    const mechanics = average(([1, 3, 5, 10] as const).flatMap(window => {
      const score = player.metrics.mechanics?.[`l${window}`]
      return score ? [
        metric(candidate => candidate.metrics.mechanics?.[`l${window}`]?.index ?? null),
        metric(candidate => candidate.metrics.mechanics?.[`l${window}`]?.trajectory ?? null),
        metric(candidate => candidate.metrics.mechanics?.[`l${window}`]?.power ?? null),
      ] : []
    }), 50)
    const trafficPlayers = previousBatters(game, player)
    const trafficRaw = average(trafficPlayers.flatMap(candidate => [
      marketProbability(candidate, 'hits1'), marketProbability(candidate, 'runs1'), marketProbability(candidate, 'hrr'),
    ]), .25)
    const traffic = percentileFor(player, candidate => {
      const preceding = previousBatters(game, candidate)
      return average(preceding.flatMap(previous => [marketProbability(previous, 'hits1'), marketProbability(previous, 'runs1'), marketProbability(previous, 'hrr')]), .25)
    }, players)
    const hrPickShare = allHrPicks > 0 ? (player.picks.home_runs ?? 0) / allHrPicks : null
    const totalHrProbability = players.reduce((sum, candidate) => sum + (marketProbability(candidate, 'hr') ?? 0), 0)
    const expectedHrShare = totalHrProbability > 0 ? (marketProbability(player, 'hr') ?? 0) / totalHrProbability : null
    const publicResidual = hrPickShare == null || expectedHrShare == null
      ? null
      : clamp(50 + (expectedHrShare - hrPickShare) * 850, 0, 100)
    const publicLeverage = publicResidual == null
      ? 50
      : publicResidual * .72 + market * .28
    const components = { market, settlement, movement, historical, statcast, mechanics, traffic, publicLeverage }
    const coherence = Math.sqrt(Math.max(0, market * settlement))
    const score = market * .17 + settlement * .18 + coherence * .05 + movement * .06 + historical * .20 + statcast * .08 + mechanics * .14 + traffic * .06 + publicLeverage * .06
    const signals: string[] = []
    const contradictions: string[] = []
    if (market >= 75) signals.push('Top-tier FHR and anytime market position')
    if (settlement >= 70) signals.push('RBI, total-base and team-win stack separates')
    if (contrast > .2) signals.push('Secondary settlement markets strengthened more than headline power')
    if (historical >= 65) signals.push('Comparable archived profiles cleared HR above their pool')
    if (evidence.samePlayerLift != null && evidence.samePlayerLift >= 1.15) signals.push('This player has cleared HR above their own baseline in similar prior profiles')
    if ((evidence.settlementShape.multiRbiHrRate ?? 0) >= .45 && p('rbi2') >= 60) signals.push('Historical analogs and today\'s RBI ladder support a multi-RBI HR shape')
    if (statcast >= 70) signals.push('Recent contact shape supports the price structure')
    if (mechanics >= 70) signals.push('SlipSurge Batter Score windows support the contact-to-flight shape')
    if (traffic >= 70) signals.push('Preceding lineup slots carry strong on-base and run pricing')
    if (publicLeverage >= 72 && allHrPicks > 0) signals.push('Market strength exceeds public HR share')
    if (player.metrics.avgLaL5 != null && (player.metrics.avgLaL5 < 8 || player.metrics.avgLaL5 > 38)) contradictions.push('Recent launch shape is outside the strongest HR band')
    if (statcast < 35) contradictions.push('Recent Statcast support is weak')
    if (marketMove(player, 'hr') != null && marketMove(player, 'hr')! < -1) contradictions.push('Anytime price moved materially longer')
    if (!signals.length) signals.push('Composite strength comes from several moderate edges')
    return {
      rank: 0,
      score,
      profileScore: score,
      learnedProbability: null,
      laneScores: { market: 0, settlement: 0, mechanics: 0, leverage: 0, composite: 0 },
      selectedLane: null,
      gapFromLeader: 0,
      player,
      components,
      signals,
      contradictions,
      historical: evidence,
      outcome: null,
      trafficRaw,
    }
  })
  const sorted = preliminary.sort((a, b) => b.score - a.score)
  const leader = sorted[0]?.score ?? 0
  return sorted.map((entry, index) => ({
    rank: index + 1,
    score: Math.round(entry.score * 10) / 10,
    profileScore: Math.round(entry.profileScore * 10) / 10,
    learnedProbability: entry.learnedProbability,
    laneScores: entry.laneScores,
    selectedLane: entry.selectedLane,
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

async function loadCanonicalArchiveForGames(games: MarketDnaGame[]) {
  const cutoff = games.map(game => game.gameDate).sort()[0]
  const admin = createAdminClient()
  const rows: ArchivedProfileRow[] = []
  const pageSize = 1000
  for (let offset = 0; offset < 25_000; offset += pageSize) {
    const { data, error } = await admin
      .from('market_dna_profile_archive')
      .select('game_date,game_pk,mlb_id,player_name,name_norm,team_abbr,batting_order,profile,feature_vector,did_hr,home_runs,hits,runs,rbis,total_bases,stolen_bases,did_double,did_triple,first_hr,hr_ml_won,source_version,updated_at')
      .lt('game_date', cutoff)
      .order('game_date', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return []
      throw new Error(`Canonical Market DNA archive could not be loaded: ${error.message}`)
    }
    const page = (data ?? []) as unknown as ArchivedProfileRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

function rankGameWithHistory(game: MarketDnaGame, rows: HistoricalRow[], canonicalRows: ArchivedProfileRow[]) {
  const evidenceByMlbId: Record<number, GameHistoryEvidence> = {}
  const comparableGameRows = canonicalRows.length >= 180 ? selectComparableGameRows(game, canonicalRows) : []
  for (const player of game.players) {
    evidenceByMlbId[player.mlbId] = canonicalRows.length >= 180
      ? buildCanonicalHistoryEvidence(player, game, comparableGameRows, canonicalRows)
      : buildHistoryEvidence(player, rows, game)
  }
  return rankMarketDnaGameProfiles(game, evidenceByMlbId)
}

async function loadOrTrainMarketDnaRanker(
  targetDate: string,
  rows: ArchivedProfileRow[],
): Promise<MarketDnaRankerArtifact | null> {
  if (rows.length < 900) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('market_dna_ranker_models')
    .select('artifact,updated_at')
    .eq('target_date', targetDate)
    .maybeSingle()
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(`Market DNA reducer could not be loaded: ${error.message}`)
  }
  const storedArtifact = data?.artifact as MarketDnaRankerArtifact | null | undefined
  const newestArchiveUpdate = rows.reduce<string | null>((latest, row) => {
    if (!row.updated_at) return latest
    return !latest || row.updated_at > latest ? row.updated_at : latest
  }, null)
  const modelUpdatedAt = typeof data?.updated_at === 'string' ? data.updated_at : null
  const archiveIsNewer = newestArchiveUpdate != null && (!modelUpdatedAt || newestArchiveUpdate > modelUpdatedAt)
  if (storedArtifact?.version === 'game-first-gbdt-v5' && !archiveIsNewer) return storedArtifact

  const artifact = trainMarketDnaRanker(rows, targetDate)
  if (!error) {
    const { error: writeError } = await admin.from('market_dna_ranker_models').upsert({
      target_date: targetDate,
      trained_through: artifact.trainedThrough,
      model_version: artifact.version,
      training_rows: artifact.trainingRows,
      validation: artifact.validation,
      artifact,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'target_date' })
    if (writeError) throw new Error(`Market DNA reducer could not be stored: ${writeError.message}`)
  }
  return artifact
}

function applyLearnedGameRanking(
  game: MarketDnaGame,
  ranking: MarketDnaGameRank[],
  artifact: MarketDnaRankerArtifact | null,
) {
  if (!artifact) return { ranking, projection: null }
  const learnedRows = ranking.map(entry => {
    const vector = canonicalFeatureVector(entry.player, game)
    const learned = scoreMarketDnaVector(artifact, vector)
    return { entry, vector, learned, lane: scoreMarketDnaLaneVector(vector) }
  }).sort((a, b) => b.learned.rawScore - a.learned.rawScore)
  const projection = projectMarketDnaGame(artifact, learnedRows.map(row => row.vector))
  const learnedRelative = new Map(learnedRows.map((row, index) => [
    row.entry.player.mlbId,
    learnedRows.length <= 1 ? 1 : 1 - index / (learnedRows.length - 1),
  ]))
  const scored = learnedRows.map(row => {
    const relative = learnedRelative.get(row.entry.player.mlbId) ?? .5
    const marketGuardScore = row.vector['market.hr.probability'] ?? .5
    return {
      ...row.entry,
      score: (artifact.rankingMode === 'market-guard'
        ? marketGuardScore
        : relative * .44 + row.lane.composite * .56) * 100,
      learnedProbability: row.learned.probability,
      laneScores: {
        market: row.lane.market * 100,
        settlement: row.lane.settlement * 100,
        mechanics: row.lane.mechanics * 100,
        leverage: row.lane.leverage * 100,
        composite: row.lane.composite * 100,
      },
      selectedLane: artifact.rankingMode === 'market-guard' ? 'market-guard' as const : null,
    }
  }).sort((a, b) => b.score - a.score || b.profileScore - a.profileScore)
  const leader = scored[0]?.score ?? 0
  return { ranking: scored.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    score: Math.round(entry.score * 10) / 10,
    gapFromLeader: Math.round((leader - entry.score) * 10) / 10,
  })), projection }
}

function buildCandidates(
  ranking: MarketDnaGameRank[],
  projection: MarketDnaGameProjection | null,
): { candidates: MarketDnaGameAnalysis['candidates']; readState: MarketDnaGameAnalysis['readState'] } {
  if (!ranking.length || !projection) return { candidates: [], readState: 'pass' }
  if (projection.candidateLimit === 0) return { candidates: [], readState: projection.confidence >= .38 ? 'clear' : 'pass' }
  const leaderGap = ranking[1] ? ranking[0].score - ranking[1].score : 0
  const weakSeparation = leaderGap < 1.5 || ranking[0].laneScores.composite < 48
  const selected = ranking
    .slice(0, Math.min(projection.candidateLimit, ranking.length))
    .filter((entry, index) => index === 0 || entry.gapFromLeader <= 16)
  if (!selected.length) return { candidates: [], readState: 'pass' }
  const readState: MarketDnaGameAnalysis['readState'] = weakSeparation || projection.confidence < .34 ? 'conditional' : 'clear'
  const candidates = selected.map((entry, index) => {
    const tier: 'primary' | 'secondary' | 'conditional' = index === 0 ? 'primary' : index === 1 ? 'secondary' : 'conditional'
    return {
      tier,
      label: tier === 'primary' ? 'Primary game read' : tier === 'secondary' ? 'Secondary independent read' : 'Conditional extra-HR read',
      score: entry.score,
      learnedRank: entry.rank,
      player: entry.player,
      reasons: [
        `Complete-board rank #${entry.rank}; market ${entry.laneScores.market.toFixed(0)}, settlement ${entry.laneScores.settlement.toFixed(0)}, mechanics ${entry.laneScores.mechanics.toFixed(0)}.`,
        artifactRankingReason(entry, projection),
        entry.laneScores.leverage >= 60
          ? 'Implied HR share is stronger than public exposure after MM, movement and adjacent-lineup context.'
          : 'The read is supported by the market-and-contact stack rather than public underexposure alone.',
        `The game model projects ${projection.label} HR event${projection.label === '1' ? '' : 's'}; this card is independent and is not a forced companion.`,
      ],
    }
  })
  return { candidates, readState }
}

function artifactRankingReason(entry: MarketDnaGameRank, projection: MarketDnaGameProjection) {
  return entry.selectedLane === 'market-guard'
    ? 'Validation guard is active: the learned ordering was not allowed to override the stronger held-out HR-price baseline.'
    : `The ${projection.label}-HR game shape is ranked through the learned market, settlement, mechanics and leverage stack.`
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
  artifact: MarketDnaRankerArtifact | null,
  projection: MarketDnaGameProjection | null,
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
  const { candidates, readState } = buildCandidates(ranking, projection)
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
    projection,
    readState,
    candidates,
    reducer: artifact ? {
      version: artifact.version,
      trainedThrough: artifact.trainedThrough,
      trainingRows: artifact.trainingRows,
      validation: artifact.validation,
    } : null,
  }
}

export async function archiveMarketDnaDate(date: string) {
  // Rebuild the board-date caches first. Each precompute now has a hard D-1
  // source boundary, so these same-date rows are both the freshest available
  // pregame features and safe to grade after the game.
  await Promise.all([
    precomputeDugoutStatcastForDate(date),
    precomputeDugoutPitchlogStatForDate(date),
    precomputeMatchupEdgeForDate(date),
  ])
  const slate = await buildMarketDnaSlate(date, { strictPregameFeatures: true, useTargetPregameCache: true })
  const sourceWarnings = [...new Set(slate.games.flatMap(game => game.sourceWarnings ?? []))]
  if (sourceWarnings.length) {
    throw new Error(`Market DNA archive refused incomplete source data: ${sourceWarnings.join(' ')}`)
  }
  const games = slate.games.filter(game => game.players.length >= 18 && /final/i.test(game.status))
  if (!games.length) return { date, games: 0, players: 0, skipped: slate.games.length }
  const refs = games.map(game => ({ gamePk: game.gamePk, status: { abstractGameState: 'Final' } }))
  const [outcomesByGame, hrResult, scores] = await Promise.all([
    fetchBoxscoreOutcomes(refs),
    fetchHrFeed(refs),
    Promise.all(games.map(game => fetchGameScore(game.gamePk))),
  ])
  const archiveRows = games.flatMap((game, index) => {
    const outcomes = outcomesByGame[game.gamePk] ?? {}
    const firstHrId = hrResult.hrFeed.find(event => event.game_pk === game.gamePk && event.is_first_hr_of_game)?.mlb_id ?? null
    const score = scores[index]
    const winningTeam = score == null || score.away === score.home ? null : score.away > score.home ? game.awayAbbr : game.homeAbbr
    return game.players.map(player => {
      const outcome = outcomes[player.mlbId]
      return {
        game_date: date,
        game_pk: game.gamePk,
        game_key: game.gameKey,
        mlb_id: player.mlbId,
        player_name: player.name,
        name_norm: player.nameNorm,
        team_abbr: player.team,
        opponent_abbr: player.opponent,
        batting_order: player.battingOrder,
        profile: player,
        feature_vector: canonicalFeatureVector(player, game),
        did_hr: (outcome?.hr ?? 0) > 0,
        home_runs: outcome?.hr ?? 0,
        hits: outcome?.h ?? 0,
        runs: outcome?.runs ?? 0,
        rbis: outcome?.rbi ?? 0,
        total_bases: outcome?.tb ?? 0,
        stolen_bases: outcome?.sb ?? 0,
        did_double: (outcome?.doubles ?? 0) > 0,
        did_triple: (outcome?.triples ?? 0) > 0,
        first_hr: player.mlbId === firstHrId,
        hr_ml_won: (outcome?.hr ?? 0) > 0 && player.team === winningTeam,
        source_version: 'canonical-v3-strict-mechanics',
        updated_at: new Date().toISOString(),
      }
    })
  })
  const admin = createAdminClient()
  for (let index = 0; index < archiveRows.length; index += 250) {
    const { error } = await admin
      .from('market_dna_profile_archive')
      .upsert(archiveRows.slice(index, index + 250), { onConflict: 'game_pk,mlb_id' })
    if (error) throw new Error(`Canonical Market DNA archive write failed: ${error.message}`)
  }
  return { date, games: games.length, players: archiveRows.length, skipped: slate.games.length - games.length }
}

export async function analyzeMarketDnaGame(game: MarketDnaGame): Promise<MarketDnaGameAnalysis> {
  const canonicalRows = await loadCanonicalArchiveForGames([game])
  const rows = canonicalRows.length >= 180 ? [] : await loadHistoricalRowsForGames([game])
  const artifact = await loadOrTrainMarketDnaRanker(game.gameDate, canonicalRows)
  const learned = applyLearnedGameRanking(game, rankGameWithHistory(game, rows, canonicalRows), artifact)
  let ranking = learned.ranking

  const gameStarted = game.players.some(player => player.gameStarted)
  let score: { away: number; home: number } | null = null
  if (gameStarted) {
    const ref = [{ gamePk: game.gamePk, status: { abstractGameState: /final/i.test(game.status) ? 'Final' : 'Live' } }]
    const [outcomesByGame, hrResult, gameScore] = await Promise.all([fetchBoxscoreOutcomes(ref), fetchHrFeed(ref), fetchGameScore(game.gamePk)])
    score = gameScore
    ranking = attachGameOutcomes(game, ranking, outcomesByGame[game.gamePk] ?? {}, hrResult.hrFeed, score)
  }
  return buildGameAnalysis(game, ranking, canonicalRows.length || rows.length, score, artifact, learned.projection)
}

export async function analyzeMarketDnaSlate(date: string, games: MarketDnaGame[]): Promise<MarketDnaSlateAudit> {
  const capturedGames = games.filter(game => game.players.length >= 18)
  if (!capturedGames.length) throw new Error('No complete 18-player boards were captured for this date.')
  const canonicalRows = await loadCanonicalArchiveForGames(capturedGames)
  const rows = canonicalRows.length >= 180 ? [] : await loadHistoricalRowsForGames(capturedGames)
  const artifact = await loadOrTrainMarketDnaRanker(date, canonicalRows)
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
    const learned = applyLearnedGameRanking(game, rankGameWithHistory(game, rows, canonicalRows), artifact)
    let ranking = learned.ranking
    if (game.players.some(player => player.gameStarted)) ranking = attachGameOutcomes(game, ranking, outcomesByGame[game.gamePk] ?? {}, hrResult.hrFeed, scores[index])
    return buildGameAnalysis(game, ranking, canonicalRows.length || rows.length, scores[index], artifact, learned.projection)
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
      candidateCoverageGames: withHr.filter(analysis => {
        const actualIds = new Set(analysis.actualHomeRuns.map(result => result.mlbId))
        return analysis.candidates.some(candidate => actualIds.has(candidate.player.mlbId))
      }).length,
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
