import { createAdminClient } from '@/lib/supabase/admin'
import { computeDugoutSpecsValue, effectiveBatSide, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'
import { normName } from '@slipsurge/core/nameNorm'
import { buildPitcherMap, computeMmByWindowForGame, type MatchupEdgeData, type MmPlayerInput, type PitcherSplitRow } from '@/lib/dugoutPaperScore'
import { fetchHistoricalGameBundles, type GameBundles } from '@/lib/matrixBacktest'
import { fetchHrFeed, type HrFeedEvent } from '@/lib/hrFeed'
import { fetchBoxscoreOutcomes, type MlbBatterOutcome } from '@/lib/mlbBoxscoreOutcomes'
import { buildRealizedHrOutcomes } from '@/lib/hrOutcomeValidation'
import {
  analyzeHrGame,
  type HrIntelGameResult,
  type HrIntelMarket,
  type HrIntelMetricWindow,
  type HrIntelPlayerInput,
  type HrIntelWindow,
} from '@/lib/hrIntelligence'

type PitchLogMixRow = {
  pitcher_id: number
  pitch_type: string | null
  stand: string | null
}

type EdgeRow = {
  mlb_id: number
  role: 'batter' | 'pitcher'
  data: MatchupEdgeData
}

export type HrIntelligenceSlate = {
  date: string
  generatedAt: string
  games: HrIntelGameResult[]
  diagnostics: {
    gamesFound: number
    gamesAnalyzed: number
    confirmedGames: number
    pikkitRowsPresent: boolean
    outcomesAvailable: number
    outcomeFailures: number
  }
}

const MARKET_SPECS: Record<string, { market: string; open: string }> = {
  hr2: { market: 'hr2', open: 'hr2Fd' },
  laser105: { market: 'laser105', open: 'laser105' },
  laser110: { market: 'laser110', open: 'laser110' },
  moonshot: { market: 'moonshot', open: 'moonshot' },
  pa1: { market: 'pa1', open: 'pa1' },
  hrMl: { market: 'hrMl', open: 'hrMl' },
  hrr: { market: 'hrr', open: 'hrrFd' },
  rbi1: { market: 'rbi', open: 'rbiFd' },
  rbi2: { market: 'rbi2', open: 'rbi2Fd' },
  rbi3: { market: 'rbi3', open: 'rbi3Fd' },
  tb2: { market: 'tb', open: 'tbFd' },
  tb3: { market: 'tb3', open: 'tb3Fd' },
  tb4: { market: 'tb4', open: 'tb4Fd' },
  tb5: { market: 'tb5', open: 'tb5Fd' },
  singles: { market: 'singles', open: 'sngFd' },
  doubles: { market: 'doubles', open: 'dblFd' },
  triples: { market: 'triples', open: 'triFd' },
  hits1: { market: 'hits', open: 'hits' },
  hits2: { market: 'hits2', open: 'hits2' },
  runs1: { market: 'runs', open: 'runs' },
  runs2: { market: 'runs2', open: 'runs2' },
  sb1: { market: 'stolen_bases', open: 'stolenBases' },
  sb2: { market: 'stolen_bases2', open: 'stolenBases2' },
}

const PICK_MARKETS = [
  'home_runs', 'hits', 'runs', 'stolen_bases', 'singles', 'doubles', 'triples',
  'rbi', 'hits_runs_rbi', 'bases',
] as const

function market(props: OddsProps | null, marketName: string, openName: string): HrIntelMarket {
  return {
    current: props?.[marketName]?.fanduel ?? null,
    open: props?.open?.[openName] ?? null,
  }
}

function marketBooks(
  props: OddsProps | null,
  marketName: 'fhr' | 'sa',
  openNames: Partial<Record<'fanduel' | 'caesars' | 'betmgm' | 'betrivers' | 'fanatics', string>>,
) {
  const current = props?.[marketName]
  return Object.fromEntries(Object.entries(openNames).map(([book, openName]) => [book, {
    current: current?.[book as keyof typeof current] ?? null,
    open: props?.open?.[openName] ?? null,
  }]))
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metricWindow(bundle: FieldBundle, window: 'season' | HrIntelWindow): HrIntelMetricWindow | null {
  const pitchlogWindow = window === 'l1' ? 'game' : window
  const pitch = bundle.pitchlogWindows?.[pitchlogWindow] ?? null
  const statcast = bundle.statcastWindows?.[window] ?? null
  if (!pitch && !statcast) return null
  return {
    bbe: finite(pitch?.bbe),
    pa: finite(pitch?.pa),
    avg: finite(pitch?.avg),
    hr: finite(pitch?.hr ?? statcast?.hr),
    avgEv: finite(pitch?.avgEv ?? statcast?.avgEv),
    maxEv: finite(pitch?.maxEv),
    hardHitPct: finite(pitch?.hardHitPct ?? statcast?.hardHitPct),
    barrelPct: finite(pitch?.barrelPct ?? statcast?.barrelPct),
    sweetSpotPct: finite(pitch?.sweetSpotPct ?? statcast?.sweetSpotPct),
    avgBatSpeed: finite(pitch?.avgBatSpeed ?? statcast?.avgBatSpeed),
    hardSwingRate: finite(statcast?.hardSwingRate),
    squaredUpPct: finite(statcast?.squaredUpPct),
    blastPct: finite(statcast?.blastPct),
    avgSwingLength: finite(statcast?.avgSwingLength),
    avgAttackAngle: finite(statcast?.avgAttackAngle),
    idealAttackAngleRate: finite(statcast?.idealAttackAngleRate),
    avgTilt: finite(statcast?.avgTilt),
    avgLa: finite(statcast?.avgLa),
    fbRate: finite(statcast?.fbRate),
    onTimePct: finite(statcast?.onTimePct),
    missDistance: finite(statcast?.missDistance),
    pullAirRate: finite(statcast?.pullAirRate),
  }
}

function marketsFor(props: OddsProps | null): Record<string, HrIntelMarket> {
  return Object.fromEntries(
    Object.entries(MARKET_SPECS).map(([key, spec]) => [key, market(props, spec.market, spec.open)]),
  )
}

function picksFor(bundle: FieldBundle, exposureAvailable: boolean): Record<string, number | null> {
  return Object.fromEntries(PICK_MARKETS.map(key => {
    const picks = finite(bundle.pikkitEntry?.[key]?.picks)
    return [key, picks ?? (exposureAvailable ? 0 : null)]
  }))
}

function playerInput(
  bundle: FieldBundle,
  player: GameBundles['game']['awayLineup'][number],
  team: string,
  opponent: string,
  lineupConfirmed: boolean,
  exposureAvailable: boolean,
): HrIntelPlayerInput {
  const props = bundle.props
  return {
    mlbId: player.mlb_id,
    name: player.name,
    team,
    opponent,
    battingOrder: player.batting_order,
    position: player.position,
    bats: player.bats,
    projected: player.projected || !lineupConfirmed,
    fhr: market(props, 'fhr', 'fhr'),
    hr: market(props, 'sa', 'saFd'),
    marketBooks: {
      fhr: marketBooks(props, 'fhr', { fanduel: 'fhr', caesars: 'fhrCz', fanatics: 'fhrFan' }),
      hr: marketBooks(props, 'sa', {
        fanduel: 'saFd', caesars: 'saCz', betmgm: 'saMgm', betrivers: 'saBr', fanatics: 'saFan',
      }),
    },
    markets: marketsFor(props),
    fhrBaselineDeltaPct: computeDugoutSpecsValue('fhr_pct', props, bundle.fhrAvg, bundle.saAvg),
    hrBaselineDeltaPct: computeDugoutSpecsValue('sa_pct', props, bundle.fhrAvg, bundle.saAvg),
    // Pikkit stores observed selections, not explicit zero rows. Once at
    // least one lineup-matched row proves that a game's feed arrived, a
    // missing player/market row means zero selections rather than missing
    // telemetry. If the entire game has no feed, values remain null and the
    // publication gate still fails closed.
    hrPicks: finite(bundle.pikkitEntry?.home_runs?.picks) ?? (exposureAvailable ? 0 : null),
    picksByMarket: picksFor(bundle, exposureAvailable),
    windows: {
      season: metricWindow(bundle, 'season'),
      l10: metricWindow(bundle, 'l10'),
      l5: metricWindow(bundle, 'l5'),
      l3: metricWindow(bundle, 'l3'),
      l1: metricWindow(bundle, 'l1'),
    },
    mm: bundle.mmByWindow ?? null,
    paperRank: bundle.ppRkByWindow ?? null,
    bookRank: bundle.bkRkByWindow ?? null,
    contextReset: false,
    boardMetrics: {
      isPowerCandidate: computeDugoutSpecsValue('is_pwr', props, bundle.fhrAvg, bundle.saAvg) === 1,
      fdCaesarsFhrGap: computeDugoutSpecsValue('div', props, bundle.fhrAvg, bundle.saAvg),
      fhrToHr: computeDugoutSpecsValue('fhr_div_sa', props, bundle.fhrAvg, bundle.saAvg),
      paToHr: computeDugoutSpecsValue('pa1_div_sa', props, bundle.fhrAvg, bundle.saAvg),
      hrToRbi: computeDugoutSpecsValue('sa_div_rbi', props, bundle.fhrAvg, bundle.saAvg),
      hrToRbi2: computeDugoutSpecsValue('sa_div_rbi2', props, bundle.fhrAvg, bundle.saAvg),
      hrToRbi3: computeDugoutSpecsValue('sa_div_rbi3', props, bundle.fhrAvg, bundle.saAvg),
      hrToHrr: computeDugoutSpecsValue('sa_div_hrr', props, bundle.fhrAvg, bundle.saAvg),
      hrToTb2: computeDugoutSpecsValue('sa_div_tb', props, bundle.fhrAvg, bundle.saAvg),
      hrToTb3: computeDugoutSpecsValue('sa_div_tb3', props, bundle.fhrAvg, bundle.saAvg),
      hrToTb4: computeDugoutSpecsValue('sa_div_tb4', props, bundle.fhrAvg, bundle.saAvg),
      hrToTb5: computeDugoutSpecsValue('sa_div_tb5', props, bundle.fhrAvg, bundle.saAvg),
      hrToTwoHr: computeDugoutSpecsValue('sa_div_hr2', props, bundle.fhrAvg, bundle.saAvg),
      hrToMoneyline: computeDugoutSpecsValue('sa_div_ml', props, bundle.fhrAvg, bundle.saAvg),
      mgmToFanduel: computeDugoutSpecsValue('m_div_f', props, bundle.fhrAvg, bundle.saAvg),
    },
  }
}

async function fetchPitcherMix(pitcherIds: number[], date: string): Promise<PitcherSplitRow[]> {
  if (!pitcherIds.length) return []
  const admin = createAdminClient()
  const seasonStart = `${date.slice(0, 4)}-02-01`
  const pageSize = 1000
  const rows: PitchLogMixRow[] = []
  const concurrency = 10
  for (let index = 0; index < pitcherIds.length; index += concurrency) {
    const chunk = pitcherIds.slice(index, index + concurrency)
    const results = await Promise.all(chunk.map(async pitcherId => {
      const pitcherRows: PitchLogMixRow[] = []
      for (let offset = 0; offset < 6000; offset += pageSize) {
        const { data, error } = await admin
          .from('player_pitch_log')
          .select('pitcher_id,pitch_type,stand')
          .eq('pitcher_id', pitcherId)
          .gte('game_date', seasonStart)
          .lt('game_date', date)
          .order('game_pk', { ascending: true })
          .order('at_bat_index', { ascending: true })
          .order('pitch_number', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (error) throw new Error(`Pitcher mix query failed: ${error.message}`)
        const page = (data ?? []) as PitchLogMixRow[]
        pitcherRows.push(...page)
        if (page.length < pageSize) break
      }
      return pitcherRows
    }))
    rows.push(...results.flat())
  }

  const output: PitcherSplitRow[] = []
  for (const pitcherId of pitcherIds) {
    const pitcherRows = rows.filter(row => Number(row.pitcher_id) === pitcherId)
    for (const hand of ['L', 'R'] as const) {
      const handRows = pitcherRows.filter(row => row.stand === hand && row.pitch_type)
      const total = handRows.length
      const pct = (pitchType: string) => total
        ? (handRows.filter(row => row.pitch_type === pitchType).length / total) * 100
        : 0
      output.push({
        mlb_id: pitcherId,
        bat_hand: hand,
        win: 'season',
        pct_fastball: pct('FF'),
        pct_sinker: pct('SI'),
        pct_cutter: pct('FC'),
        pct_slider: pct('SL'),
        pct_curveball: pct('CU'),
        pct_changeup: pct('CH'),
        pct_splitter: pct('FS'),
      })
    }
  }
  return output
}

function attachMm(
  gameBundle: GameBundles,
  pitcherMap: ReturnType<typeof buildPitcherMap>,
  batterEdges: Record<number, MatchupEdgeData>,
  pitcherEdges: Record<number, MatchupEdgeData>,
) {
  const { game } = gameBundle
  const entries = [
    ...game.awayLineup.map(player => ({
      player,
      bundle: gameBundle.awayBundle.get(normName(player.name)),
      pitcher: game.homePitcher,
      pitcherHand: (game.homePitcher?.hand === 'L' ? 'L' : 'R') as 'L' | 'R',
    })),
    ...game.homeLineup.map(player => ({
      player,
      bundle: gameBundle.homeBundle.get(normName(player.name)),
      pitcher: game.awayPitcher,
      pitcherHand: (game.awayPitcher?.hand === 'L' ? 'L' : 'R') as 'L' | 'R',
    })),
  ].filter((entry): entry is typeof entry & { bundle: FieldBundle } => !!entry.bundle)

  const inputs: MmPlayerInput[] = entries.map(({ player, bundle, pitcher, pitcherHand }) => ({
    mlbId: player.mlb_id,
    effectiveBats: effectiveBatSide(player.bats, pitcherHand),
    pitcherHand,
    pitcherId: pitcher?.id ?? null,
    saFd: bundle.props?.sa?.fanduel ?? null,
    statcastWindows: bundle.statcastWindows,
    batterMatchupData: batterEdges[player.mlb_id] ?? null,
  }))
  const ranked = computeMmByWindowForGame(inputs, pitcherMap, pitcherEdges)
  for (const { player, bundle } of entries) {
    bundle.mmByWindow = ranked.mm[player.mlb_id]
    bundle.bkRkByWindow = ranked.bkRk[player.mlb_id]
    bundle.ppRkByWindow = ranked.ppRk[player.mlb_id]
  }
}

// Market DNA and HR Intelligence both need the exact MM values shown by
// The Dugout. Keep the cache reads and whole-game ranking pass here so every
// admin surface receives the same l1/l3/l5/l10 values without recreating MM.
export async function attachCanonicalMmToBundles(
  gameBundles: GameBundles[],
  date: string,
  options: { strictPregameFeatures?: boolean; useTargetPregameCache?: boolean } = {},
): Promise<void> {
  const pitcherIds = [...new Set(gameBundles
    .flatMap(bundle => [bundle.game.homePitcher?.id, bundle.game.awayPitcher?.id])
    .filter((id): id is number => !!id))]
  const admin = createAdminClient()
  const allMlbIds = [...new Set(gameBundles.flatMap(bundle => [
    ...bundle.game.homeLineup.map(player => player.mlb_id),
    ...bundle.game.awayLineup.map(player => player.mlb_id),
    bundle.game.homePitcher?.id,
    bundle.game.awayPitcher?.id,
  ].filter((id): id is number => Boolean(id))))]
  const edgeStart = new Date(`${date}T12:00:00Z`)
  edgeStart.setUTCDate(edgeStart.getUTCDate() - 14)
  const edgeStartDate = edgeStart.toISOString().slice(0, 10)
  const edgeRowsPromise = options.strictPregameFeatures && !options.useTargetPregameCache
    ? (async () => {
      const rows: Array<EdgeRow & { game_date: string }> = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.from('dugout_matchup_edge_precomputed').select('game_date,mlb_id,role,data')
          .gte('game_date', edgeStartDate).lt('game_date', date).in('mlb_id', allMlbIds)
          .order('game_date', { ascending: false }).order('mlb_id').order('role').range(offset, offset + 999)
        if (error) throw new Error(`Matchup-edge query failed: ${error.message}`)
        if (!data?.length) break
        rows.push(...data as Array<EdgeRow & { game_date: string }>)
        if (data.length < 1000) break
      }
      return rows
    })()
    : admin.from('dugout_matchup_edge_precomputed').select('mlb_id,role,data')
      .eq('game_date', date).order('mlb_id').order('role').then(({ data, error }) => {
        if (error) throw new Error(`Matchup-edge query failed: ${error.message}`)
        return (data ?? []) as EdgeRow[]
      })
  const [pitcherRows, edgeRows] = await Promise.all([
    fetchPitcherMix(pitcherIds, date),
    edgeRowsPromise,
  ])

  const batterEdges: Record<number, MatchupEdgeData> = {}
  const pitcherEdges: Record<number, MatchupEdgeData> = {}
  for (const row of edgeRows) {
    if (row.role === 'batter' && !batterEdges[row.mlb_id]) batterEdges[row.mlb_id] = row.data
    else if (row.role === 'pitcher' && !pitcherEdges[row.mlb_id]) pitcherEdges[row.mlb_id] = row.data
  }
  const pitcherMap = buildPitcherMap(pitcherRows)
  for (const bundle of gameBundles) attachMm(bundle, pitcherMap, batterEdges, pitcherEdges)
}

function analyzeBundle(gameBundle: GameBundles, slateDate: string): HrIntelGameResult {
  const { game } = gameBundle
  const warnings: string[] = [...gameBundle.sourceWarnings]
  const players: HrIntelPlayerInput[] = []
  const exposureAvailable = Object.values(gameBundle.gameTotalPicksByMarket).some(value => value > 0)
  for (const player of game.awayLineup) {
    const bundle = gameBundle.awayBundle.get(normName(player.name))
    if (bundle) players.push(playerInput(bundle, player, game.awayAbbr, game.homeAbbr, game.awayLineupConfirmed, exposureAvailable))
  }
  for (const player of game.homeLineup) {
    const bundle = gameBundle.homeBundle.get(normName(player.name))
    if (bundle) players.push(playerInput(bundle, player, game.homeAbbr, game.awayAbbr, game.homeLineupConfirmed, exposureAvailable))
  }
  if (!players.some(player => player.hrPicks != null)) {
    warnings.push('No Pikkit exposure rows were available for this game. Public-exposure evidence is not being treated as complete.')
  }
  if (!players.some(player => player.mm && Object.values(player.mm).some(value => value != null))) {
    warnings.push('MM and paper-rank evidence is unavailable for this game.')
  }
  return analyzeHrGame({
    // Historical matchup records can carry a stale embedded gameDate when a
    // matchup is reconstructed from a saved slate. The selected slate date is
    // the source of truth for calibration, diagnostics, and postgame grading.
    date: slateDate,
    gamePk: game.gamePk,
    gameKey: gameBundle.gameKey,
    awayTeam: game.awayAbbr,
    homeTeam: game.homeAbbr,
    awayLineupConfirmed: game.awayLineupConfirmed,
    homeLineupConfirmed: game.homeLineupConfirmed,
    noHr: gameBundle.noHr,
    players,
    warnings,
  })
}

function attachValidation(
  game: HrIntelGameResult,
  events: HrFeedEvent[],
  boxscoreByMlbId: Record<number, MlbBatterOutcome>,
): HrIntelGameResult {
  const ordered = [...events].sort((left, right) => left.ab_index - right.ab_index)
  const first = ordered[0] ?? null
  const hrMlbIds = [...new Set(ordered.map(event => event.mlb_id).filter((id): id is number => id != null))]
  const hrNames = [...new Set(ordered.map(event => event.player_name).filter(Boolean))]
  const anchorId = game.recommendation.fhrAnchorMlbId
  const diagnosticLeaderId = game.recommendation.diagnosticLeaderMlbId
  const companionId = game.recommendation.anytimeCompanionMlbId
  const boardFhrId = game.recommendation.boardFhrMlbId
  const boardCompanionId = game.recommendation.boardCompanionMlbId
  const primaryPublished = anchorId != null && game.recommendation.status !== 'abstain'
  const companionPublished = companionId != null && game.recommendation.status === 'qualified'
  const fhrShortlistPublished = game.recommendation.dataComplete && game.recommendation.status !== 'abstain' && game.recommendation.fhrCandidateMlbIds.length > 0
  const anytimeCandidatesPublished = game.recommendation.dataComplete && game.recommendation.status !== 'abstain' && game.recommendation.anytimeCandidateMlbIds.length > 0
  const companionWatchPublished = game.recommendation.dataComplete && game.recommendation.status !== 'abstain' && game.recommendation.companionShortlistMlbIds.length > 0
  const anchorHit = anchorId != null && first?.mlb_id === anchorId
  const diagnosticLeaderHit = diagnosticLeaderId != null && first?.mlb_id === diagnosticLeaderId
  const companionHit = companionId != null && hrMlbIds.includes(companionId)
  const boardFhrHit = boardFhrId != null && first?.mlb_id === boardFhrId
  const boardCompanionHit = boardCompanionId != null && hrMlbIds.includes(boardCompanionId)
  const contradictionLeaderHit = game.recommendation.contradictionLeaderMlbId != null && first?.mlb_id === game.recommendation.contradictionLeaderMlbId
  const modelLeaderHit = game.recommendation.modelLeaderMlbId != null && first?.mlb_id === game.recommendation.modelLeaderMlbId
  const marketLeaderHit = game.recommendation.marketLeaderMlbId != null && first?.mlb_id === game.recommendation.marketLeaderMlbId
  const fhrShortlistHit = first?.mlb_id != null && game.recommendation.fhrCandidateMlbIds.includes(first.mlb_id)
  const diagnosticFhrShortlistHit = first?.mlb_id != null && game.recommendation.fhrShortlistMlbIds.includes(first.mlb_id)
  const anytimeCandidateHits = game.recommendation.anytimeCandidateMlbIds.filter(id => hrMlbIds.includes(id)).length
  const anytimeCandidateMisses = game.recommendation.anytimeCandidateMlbIds.length - anytimeCandidateHits
  const contrarianWatchHit = first?.mlb_id != null && game.recommendation.contrarianWatchMlbIds.includes(first.mlb_id)
  const companionShortlistHit = game.recommendation.companionShortlistMlbIds.some(id => hrMlbIds.includes(id) && id !== first?.mlb_id)
  const laterHrIds = hrMlbIds.filter(id => id !== first?.mlb_id)
  const candidateSetPairHit = diagnosticFhrShortlistHit && laterHrIds.some(id => game.recommendation.fhrShortlistMlbIds.includes(id))
  const candidateContrarianPairHit = first?.mlb_id != null && (
    (game.recommendation.fhrShortlistMlbIds.includes(first.mlb_id) && laterHrIds.some(id => game.recommendation.contrarianWatchMlbIds.includes(id))) ||
    (game.recommendation.contrarianWatchMlbIds.includes(first.mlb_id) && laterHrIds.some(id => game.recommendation.fhrShortlistMlbIds.includes(id)))
  )
  const pairCoverageHit = candidateSetPairHit || candidateContrarianPairHit || (diagnosticFhrShortlistHit && companionShortlistHit)
  return {
    ...game,
    validation: {
      actualNoHr: ordered.length === 0,
      firstHrMlbId: first?.mlb_id ?? null,
      firstHrName: first?.player_name ?? null,
      hrMlbIds,
      hrNames,
      anchorHit,
      diagnosticLeaderHit,
      primaryPublished,
      companionHit,
      companionPublished,
      pairHit: anchorHit && companionHit,
      fhrShortlistHit,
      fhrShortlistPublished,
      diagnosticFhrShortlistHit,
      anytimeCandidateHits,
      anytimeCandidateMisses,
      anytimeCandidatesPublished,
      contrarianWatchHit,
      companionShortlistHit,
      companionWatchPublished,
      candidateSetPairHit,
      candidateContrarianPairHit,
      pairCoverageHit,
      boardFhrHit,
      boardCompanionHit,
      boardPairHit: boardFhrHit && boardCompanionHit,
      contradictionLeaderHit,
      modelLeaderHit,
      marketLeaderHit,
      realizedHrOutcomes: buildRealizedHrOutcomes(game, ordered, boxscoreByMlbId),
    },
  }
}

export async function buildHrIntelligenceSlate(
  date: string,
  gamePk?: number,
  options: { strictPregameFeatures?: boolean } = {},
): Promise<HrIntelligenceSlate> {
  const allBundles = await fetchHistoricalGameBundles(date, { strictPregameFeatures: options.strictPregameFeatures })
  const bundles = gamePk == null ? allBundles : allBundles.filter(bundle => bundle.game.gamePk === gamePk)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const outcomeBundles = date < today ? bundles : bundles.filter(bundle => bundle.game.status === 'Final')
  const [, outcomeResult, boxscoreOutcomes] = await Promise.all([
    attachCanonicalMmToBundles(bundles, date, options),
    outcomeBundles.length
      ? fetchHrFeed(outcomeBundles.map(bundle => ({ gamePk: bundle.game.gamePk, status: { abstractGameState: 'Final' } })))
      : Promise.resolve({ hrFeed: [], pitcherIdByName: {}, completedGamePks: [], failures: [] }),
    outcomeBundles.length
      ? fetchBoxscoreOutcomes(outcomeBundles.map(bundle => ({ gamePk: bundle.game.gamePk, status: { abstractGameState: 'Final' } })))
      : Promise.resolve({} as Record<number, Record<number, MlbBatterOutcome>>),
  ])
  const eventsByGame = new Map<number, HrFeedEvent[]>()
  for (const event of outcomeResult.hrFeed) {
    const events = eventsByGame.get(event.game_pk) ?? []
    events.push(event)
    eventsByGame.set(event.game_pk, events)
  }
  const completedGamePks = new Set(outcomeResult.completedGamePks)
  const failureByGamePk = new Map(outcomeResult.failures.map(failure => [failure.gamePk, failure.reason]))
  const games = bundles.map(bundle => {
    const analysis = analyzeBundle(bundle, date)
    if (completedGamePks.has(bundle.game.gamePk)) return attachValidation(
      analysis,
      eventsByGame.get(bundle.game.gamePk) ?? [],
      boxscoreOutcomes[bundle.game.gamePk] ?? {},
    )
    const failure = failureByGamePk.get(bundle.game.gamePk)
    return failure
      ? { ...analysis, warnings: [...analysis.warnings, `Postgame validation unavailable: ${failure}`] }
      : analysis
  })

  return {
    date,
    generatedAt: new Date().toISOString(),
    games,
    diagnostics: {
      gamesFound: allBundles.length,
      gamesAnalyzed: games.length,
      confirmedGames: games.filter(game => game.homeLineupConfirmed && game.awayLineupConfirmed).length,
      pikkitRowsPresent: games.some(game => game.players.some(player => player.hrPicks != null)),
      outcomesAvailable: games.filter(game => game.validation).length,
      outcomeFailures: outcomeResult.failures.length,
    },
  }
}
