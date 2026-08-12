import { createAdminClient } from '@/lib/supabase/admin'
import { computeDugoutSpecsValue, effectiveBatSide, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'
import { normName } from '@slipsurge/core/nameNorm'
import { buildPitcherMap, computeMmByWindowForGame, type MatchupEdgeData, type MmPlayerInput, type PitcherSplitRow } from '@/lib/dugoutPaperScore'
import { fetchHistoricalGameBundles, type GameBundles } from '@/lib/matrixBacktest'
import { fetchHrFeed, type HrFeedEvent } from '@/lib/hrFeed'
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
  }
}

const MARKET_SPECS: Record<string, { market: string; open: string }> = {
  hr2: { market: 'hr2', open: 'hr2Fd' },
  laser105: { market: 'laser105', open: 'laser105' },
  laser110: { market: 'laser110', open: 'laser110' },
  moonshot: { market: 'moonshot', open: 'moonshot' },
  pa1: { market: 'pa1', open: 'pa1' },
  hrMl: { market: 'hrMl', open: 'hrMl' },
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
    pullAirRate: finite(statcast?.pullAirRate),
  }
}

function marketsFor(props: OddsProps | null): Record<string, HrIntelMarket> {
  return Object.fromEntries(
    Object.entries(MARKET_SPECS).map(([key, spec]) => [key, market(props, spec.market, spec.open)]),
  )
}

function picksFor(bundle: FieldBundle): Record<string, number | null> {
  return Object.fromEntries(PICK_MARKETS.map(key => [key, finite(bundle.pikkitEntry?.[key]?.picks)]))
}

function playerInput(
  bundle: FieldBundle,
  player: GameBundles['game']['awayLineup'][number],
  team: string,
  opponent: string,
  lineupConfirmed: boolean,
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
    markets: marketsFor(props),
    fhrBaselineDeltaPct: computeDugoutSpecsValue('fhr_pct', props, bundle.fhrAvg, bundle.saAvg),
    hrBaselineDeltaPct: computeDugoutSpecsValue('sa_pct', props, bundle.fhrAvg, bundle.saAvg),
    hrPicks: finite(bundle.pikkitEntry?.home_runs?.picks),
    picksByMarket: picksFor(bundle),
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

function analyzeBundle(gameBundle: GameBundles): HrIntelGameResult {
  const { game } = gameBundle
  const warnings: string[] = []
  const players: HrIntelPlayerInput[] = []
  for (const player of game.awayLineup) {
    const bundle = gameBundle.awayBundle.get(normName(player.name))
    if (bundle) players.push(playerInput(bundle, player, game.awayAbbr, game.homeAbbr, game.awayLineupConfirmed))
  }
  for (const player of game.homeLineup) {
    const bundle = gameBundle.homeBundle.get(normName(player.name))
    if (bundle) players.push(playerInput(bundle, player, game.homeAbbr, game.awayAbbr, game.homeLineupConfirmed))
  }
  if (!players.some(player => player.hrPicks != null)) {
    warnings.push('No Pikkit exposure rows were available for this game. Public-exposure evidence is not being treated as complete.')
  }
  if (!players.some(player => player.mm && Object.values(player.mm).some(value => value != null))) {
    warnings.push('MM and paper-rank evidence is unavailable for this game.')
  }
  return analyzeHrGame({
    date: gameBundle.game.gameDate.slice(0, 10),
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

function attachValidation(game: HrIntelGameResult, events: HrFeedEvent[]): HrIntelGameResult {
  const ordered = [...events].sort((left, right) => left.ab_index - right.ab_index)
  const first = ordered[0] ?? null
  const hrMlbIds = [...new Set(ordered.map(event => event.mlb_id).filter((id): id is number => id != null))]
  const hrNames = [...new Set(ordered.map(event => event.player_name).filter(Boolean))]
  const anchorId = game.recommendation.fhrAnchorMlbId
  const companionId = game.recommendation.anytimeCompanionMlbId
  const anchorHit = anchorId != null && first?.mlb_id === anchorId
  const companionHit = companionId != null && hrMlbIds.includes(companionId)
  return {
    ...game,
    validation: {
      actualNoHr: ordered.length === 0,
      firstHrMlbId: first?.mlb_id ?? null,
      firstHrName: first?.player_name ?? null,
      hrMlbIds,
      hrNames,
      anchorHit,
      companionHit,
      pairHit: anchorHit && companionHit,
    },
  }
}

export async function buildHrIntelligenceSlate(date: string, gamePk?: number): Promise<HrIntelligenceSlate> {
  const allBundles = await fetchHistoricalGameBundles(date)
  const bundles = gamePk == null ? allBundles : allBundles.filter(bundle => bundle.game.gamePk === gamePk)
  const pitcherIds = [...new Set(bundles.flatMap(bundle => [bundle.game.homePitcher?.id, bundle.game.awayPitcher?.id]).filter((id): id is number => !!id))]
  const admin = createAdminClient()
  const finalBundles = bundles.filter(bundle => bundle.game.status === 'Final')
  const [pitcherRows, edgeResult, outcomeResult] = await Promise.all([
    fetchPitcherMix(pitcherIds, date),
    admin.from('dugout_matchup_edge_precomputed').select('mlb_id,role,data').eq('game_date', date),
    finalBundles.length
      ? fetchHrFeed(finalBundles.map(bundle => ({ gamePk: bundle.game.gamePk, status: { abstractGameState: 'Final' } })))
      : Promise.resolve({ hrFeed: [], pitcherIdByName: {} }),
  ])
  if (edgeResult.error) throw new Error(`Matchup-edge query failed: ${edgeResult.error.message}`)

  const batterEdges: Record<number, MatchupEdgeData> = {}
  const pitcherEdges: Record<number, MatchupEdgeData> = {}
  for (const row of (edgeResult.data ?? []) as EdgeRow[]) {
    if (row.role === 'batter') batterEdges[row.mlb_id] = row.data
    else pitcherEdges[row.mlb_id] = row.data
  }
  const pitcherMap = buildPitcherMap(pitcherRows)
  for (const bundle of bundles) attachMm(bundle, pitcherMap, batterEdges, pitcherEdges)
  const eventsByGame = new Map<number, HrFeedEvent[]>()
  for (const event of outcomeResult.hrFeed) {
    const events = eventsByGame.get(event.game_pk) ?? []
    events.push(event)
    eventsByGame.set(event.game_pk, events)
  }
  const finalGamePks = new Set(finalBundles.map(bundle => bundle.game.gamePk))
  const games = bundles.map(bundle => {
    const analysis = analyzeBundle(bundle)
    return finalGamePks.has(bundle.game.gamePk)
      ? attachValidation(analysis, eventsByGame.get(bundle.game.gamePk) ?? [])
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
    },
  }
}
