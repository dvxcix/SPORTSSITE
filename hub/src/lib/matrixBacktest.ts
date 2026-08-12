import { createAdminClient } from '@/lib/supabase/admin'
import { normName, resolveNameEntry } from '@slipsurge/core/nameNorm'
import { canonGameKey } from '@slipsurge/core/teamAbbr'
import { getTodaysMatchups, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { asyncPool } from '@/lib/matrixMatch'
import { DUGOUT_STATCAST_TABLE } from '@/lib/dugoutStatcastPrecompute'
import { DUGOUT_PITCHLOG_STAT_TABLE } from '@/lib/dugoutPitchlogStatPrecompute'
import { DUGOUT_SEASON_AVG_TABLE } from '@/lib/dugoutSeasonAvgPrecompute'
import type { StatcastWindow, StatcastLine } from '@slipsurge/core/dugoutStatcast'
import type { BatterStats } from '@slipsurge/core/batterStatsEngine'
import {
  type Matrix, type MatrixFactor, type MatrixTiebreaker,
  type FieldBundle, type PitchlogStatWindow, type DugoutSpecsAverages,
  runPipelineStep, evaluateMatrix, groupTiedCandidates, filterTieGroups, resolveTiebreakers, resolveFieldValue,
  evaluateOddsFactor, evaluateDugoutSpecsFactor, evaluatePitchlogFactorPrecomputed, evaluateSavantFactor, evaluatePicksFactor,
  MULTI_BOOK_MARKET,
} from '@slipsurge/core/matrixEngine'

// Backtests a saved Matrix (classic or pipeline) against real, already-
// completed slates — for a given PAST date, independently reconstructs
// every input a Factor/step could reference, runs the SAME exported engine
// functions dugout/data/route.ts's live evaluation uses (zero reimplemented
// decision logic — only the data-fetching below is new code), and grades
// the result against real box score home runs. This is the productionized
// version of the by-hand 2026-07-24 reconstruction that first diagnosed why
// the "TIe-Breaker" pipeline was flagging the wrong players — see that
// diagnosis for the full root-cause writeup (exact-2-decimal tie matching
// discarding real standouts).
//
// Deliberately does NOT touch or import from dugout/data/route.ts (it
// exports nothing but its own GET handler, and has a documented history of
// production incidents under load — not worth any risk to a live,
// revenue-generating route for an unrelated offline tool). A small amount
// of intentional duplication in the DATA-FETCHING layer only (never the
// business logic) is the accepted tradeoff.

const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }

// PostgREST silently caps an unpaginated select at 1000 rows with no
// ordering, so anything past that is effectively random which rows survive
// — a real, previously-hit incident class in this codebase (see
// fetchGapOddsOpening/fetchGapOdds in dugout/data/route.ts). Confirmed live
// here too: dugout_season_avg_precomputed for one date came back at exactly
// 1000 rows, and two specific real players (Yelich/Turang) just didn't
// happen to survive the cut — silently producing null season averages for
// them instead of an error. Every admin.from(...) select in this file that
// isn't already bounded by a real filter (game_pk IN a known small list)
// pages through this helper instead.
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await build(offset, offset + PAGE - 1)
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

async function mpGetAll(path: string): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    try {
      const res = await fetch(`${MP_URL}${path}`, { headers: { ...mpH, Range: `${offset}-${offset + PAGE - 1}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      if (!res.ok) break
      const page = await res.json()
      if (!Array.isArray(page) || !page.length) break
      out.push(...page)
      if (page.length < PAGE) break
    } catch { break }
  }
  return out
}

// Exact copy of dugout/data/route.ts's own reshaping table — market_opening_
// prices rows come back as `${market}:${book}` -> price; this maps that onto
// the same `.open.<field>` names evaluateOddsFactor's oddsFactorTrueForPrice
// reads.
const MARKET_BOOK_TO_OPEN_FIELD: Record<string, string> = {
  'fhr:fanduel': 'fhr', 'sa:fanduel': 'saFd', 'hr2:fanduel': 'hr2Fd',
  'singles:fanduel': 'sngFd', 'doubles:fanduel': 'dblFd', 'triples:fanduel': 'triFd',
  'rbi:fanduel': 'rbiFd', 'rbi2:fanduel': 'rbi2Fd', 'rbi3:fanduel': 'rbi3Fd',
  'tb:fanduel': 'tbFd', 'tb3:fanduel': 'tb3Fd', 'tb4:fanduel': 'tb4Fd', 'tb5:fanduel': 'tb5Fd',
  'hrr:fanduel': 'hrrFd', 'laser105:fanduel': 'laser105', 'laser110:fanduel': 'laser110',
  'moonshot:fanduel': 'moonshot', 'pa1:fanduel': 'pa1', 'hrMl:fanduel': 'hrMl',
  'combo1Min:fanduel': 'combo1Min', 'combo2Min:fanduel': 'combo2Min',
  'hits:fanduel': 'hits', 'hits2:fanduel': 'hits2', 'runs:fanduel': 'runs', 'runs2:fanduel': 'runs2',
  'stolen_bases:fanduel': 'stolenBases', 'stolen_bases2:fanduel': 'stolenBases2',
  'sa:betmgm': 'saMgm', 'hr2:betmgm': 'hr2Mgm',
  'fhr:caesars': 'fhrCz', 'sa:caesars': 'saCz',
  'fhr:fanatics': 'fhrFan', 'sa:betrivers': 'saBr', 'sa:fanatics': 'saFan',
}

export type GameBundles = {
  game: TodayGame
  gameKey: string
  homeBundle: Map<string, FieldBundle>
  awayBundle: Map<string, FieldBundle>
  gameTotalPicksByMarket: Record<string, number>
  noHr: { current: number | null; open: number | null }
}

// Everything a Factor/pipeline step across every category could reference,
// for one PAST date, fetched once and reused across every game that date —
// same shape dugout/data/route.ts's own per-request bundle-building uses,
// just independently reconstructed for an arbitrary historical date instead
// of "today."
export async function fetchHistoricalGameBundles(date: string): Promise<GameBundles[]> {
  const admin = createAdminClient()

  const [games, snapRows, fdRows, mgmRows, openingRowsAll, seasonAvgRows, statcastRows, pitchlogRows, pikkitRows] = await Promise.all([
    getTodaysMatchups(date),
    admin.from('pregame_odds_snapshots').select('game_pk, prop_map').eq('game_date', date).then(r => r.data ?? []),
    admin.from('fanduel_gap_odds')
      .select('game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd, no_hr_fd, combo1_min, combo1_count, combo1_partners, combo2_min, combo2_count, combo2_partners')
      .eq('game_date', date).range(0, 19999).then(r => r.data ?? []),
    admin.from('mgm_gap_odds').select('game_key, name_norm, sa_mgm, hr2_mgm').eq('game_date', date).range(0, 19999).then(r => r.data ?? []),
    selectAll<{ game_key: string; name_norm: string; market: string; book: string; opening_price: number }>(
      (from, to) => admin.from('market_opening_prices').select('game_key, name_norm, market, book, opening_price').eq('game_date', date).range(from, to)
    ),
    selectAll<{ name_norm: string; bookmaker: string; avg_price: number; market_key: string }>(
      (from, to) => admin.from(DUGOUT_SEASON_AVG_TABLE).select('name_norm, bookmaker, avg_price, market_key').eq('game_date', date).in('market_key', ['batter_first_home_run', 'batter_home_runs']).range(from, to)
    ),
    selectAll<{ mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<StatcastWindow, StatcastLine> }>(
      (from, to) => admin.from(DUGOUT_STATCAST_TABLE).select('mlb_id, pitcher_hand, windows').eq('game_date', date).range(from, to)
    ),
    selectAll<{ mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<PitchlogStatWindow, BatterStats> }>(
      (from, to) => admin.from(DUGOUT_PITCHLOG_STAT_TABLE).select('mlb_id, pitcher_hand, windows').eq('game_date', date).range(from, to)
    ),
    mpGetAll(`/rest/v1/pikkit_public_picks?game_date=eq.${date}&select=player_name,picks,prop_type,game_key`),
  ])

  if (!games.length) return []

  // Read-only: never touch pregame_odds_snapshots.is_frozen. A completed
  // game's row is permanently frozen already and never revisited by any
  // other writer, so this is the exact "current" price the live board used.
  const snapByGamePk = new Map<string, any>()
  for (const s of snapRows) snapByGamePk.set(String(s.game_pk), s.prop_map ?? {})

  const fanduelGapByGameKey: Record<string, Record<string, any>> = {}
  for (const r of fdRows) (fanduelGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
  const mgmGapByGameKey: Record<string, Record<string, any>> = {}
  for (const r of mgmRows) (mgmGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
  const openingByGameKey: Record<string, Record<string, Record<string, number>>> = {}
  for (const r of openingRowsAll) {
    const byName = (openingByGameKey[canonGameKey(r.game_key)] ??= {})
    ;(byName[r.name_norm] ??= {})[`${r.market}:${r.book}`] = Number(r.opening_price)
  }

  const fhrAvgMap: Record<string, DugoutSpecsAverages> = {}
  const saAvgMap: Record<string, DugoutSpecsAverages> = {}
  for (const r of seasonAvgRows) {
    const nn = normName(r.name_norm || '')
    if (!nn) continue
    const target = r.market_key === 'batter_first_home_run' ? fhrAvgMap : saAvgMap
    if (!target[nn]) target[nn] = {}
    if (r.bookmaker === 'fanduel') target[nn].fd = Number(r.avg_price)
    if (r.bookmaker === 'williamhill_us') target[nn].cz = Number(r.avg_price)
  }

  const statcastByBatter: Record<number, Partial<Record<'L' | 'R', Record<StatcastWindow, StatcastLine>>>> = {}
  for (const row of statcastRows) (statcastByBatter[row.mlb_id] ??= {})[row.pitcher_hand] = row.windows
  const pitchlogByBatter: Record<number, Partial<Record<'L' | 'R', Record<PitchlogStatWindow, BatterStats>>>> = {}
  for (const row of pitchlogRows) (pitchlogByBatter[row.mlb_id] ??= {})[row.pitcher_hand] = row.windows

  return games.map(game => {
    const gameKey = canonGameKey(game.gameKey)
    const fanduelGapByName = fanduelGapByGameKey[gameKey] ?? {}
    const mgmGapByName = mgmGapByGameKey[gameKey] ?? {}
    const openingByName = openingByGameKey[gameKey] ?? {}
    const propMap = snapByGamePk.get(String(game.gamePk)) ?? {}

    const bdlByName: Record<string, any> = {}
    for (const entry of Object.values(propMap) as any[]) bdlByName[normName(entry.name)] = entry

    // Same merge precedence as dugout/data/route.ts:1058-1122 — fhr always
    // overwrites (unconditional), everything else only fills a gap BDL
    // itself didn't already have.
    for (const [nn, gap] of Object.entries(fanduelGapByName) as [string, any][]) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: gap.player_name ?? nn })
      if (gap.fhr_fd != null) entry.fhr = { ...entry.fhr, fanduel: gap.fhr_fd }
      if (gap.sa_fd != null && entry.sa?.fanduel == null) entry.sa = { ...entry.sa, fanduel: gap.sa_fd }
      if (gap.hr2_fd != null && entry.hr2?.fanduel == null) entry.hr2 = { ...entry.hr2, fanduel: gap.hr2_fd }
      if (gap.sng_fd != null && entry.singles?.fanduel == null) entry.singles = { ...entry.singles, fanduel: gap.sng_fd }
      if (gap.dbl_fd != null && entry.doubles?.fanduel == null) entry.doubles = { ...entry.doubles, fanduel: gap.dbl_fd }
      if (gap.tri_fd != null && entry.triples?.fanduel == null) entry.triples = { ...entry.triples, fanduel: gap.tri_fd }
      if (gap.rbi_fd != null && entry.rbi?.fanduel == null) entry.rbi = { ...entry.rbi, fanduel: gap.rbi_fd }
      if (gap.rbi2_fd != null && entry.rbi2?.fanduel == null) entry.rbi2 = { ...entry.rbi2, fanduel: gap.rbi2_fd }
      if (gap.rbi3_fd != null && entry.rbi3?.fanduel == null) entry.rbi3 = { ...entry.rbi3, fanduel: gap.rbi3_fd }
      if (gap.tb_fd != null && entry.tb?.fanduel == null) entry.tb = { ...entry.tb, fanduel: gap.tb_fd }
      if (gap.tb3_fd != null && entry.tb3?.fanduel == null) entry.tb3 = { ...entry.tb3, fanduel: gap.tb3_fd }
      if (gap.tb4_fd != null && entry.tb4?.fanduel == null) entry.tb4 = { ...entry.tb4, fanduel: gap.tb4_fd }
      if (gap.tb5_fd != null && entry.tb5?.fanduel == null) entry.tb5 = { ...entry.tb5, fanduel: gap.tb5_fd }
      if (gap.hrr_fd != null && entry.hrr?.fanduel == null) entry.hrr = { ...entry.hrr, fanduel: gap.hrr_fd }
      if (gap.laser105_fd != null) entry.laser105 = { ...entry.laser105, fanduel: gap.laser105_fd }
      if (gap.laser110_fd != null) entry.laser110 = { ...entry.laser110, fanduel: gap.laser110_fd }
      if (gap.moonshot_fd != null) entry.moonshot = { ...entry.moonshot, fanduel: gap.moonshot_fd }
      if (gap.pa1_fd != null) entry.pa1 = { ...entry.pa1, fanduel: gap.pa1_fd }
      if (gap.hr_ml_fd != null) entry.hrMl = { ...entry.hrMl, fanduel: gap.hr_ml_fd }
    }
    for (const [nn, mgm] of Object.entries(mgmGapByName) as [string, any][]) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: mgm.player_name ?? nn })
      if (mgm.sa_mgm != null && entry.sa?.betmgm == null) entry.sa = { ...entry.sa, betmgm: mgm.sa_mgm }
      if (mgm.hr2_mgm != null && entry.hr2?.betmgm == null) entry.hr2 = { ...entry.hr2, betmgm: mgm.hr2_mgm }
    }
    for (const [nn, marketBookPrices] of Object.entries(openingByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: nn })
      const open = { ...entry.open }
      for (const [marketBook, price] of Object.entries(marketBookPrices)) {
        const field = MARKET_BOOK_TO_OPEN_FIELD[marketBook]
        if (field) open[field] = price
      }
      entry.open = open
    }

    // Picks — NOT filtered by prop_type (a Matrix can reference any picks
    // market); per-game-scoped exactly like route.ts:1148-1177, preferring
    // a row explicitly tagged with this game_key over a legacy untagged one.
    const gameTotalPicksByMarket: Record<string, number> = {}
    const pikkitByName: Record<string, Record<string, any>> = {}
    for (const r of pikkitRows) {
      if (r.game_key && canonGameKey(r.game_key) !== gameKey) continue
      const nn = normName(r.player_name || '')
      const market = r.prop_type
      if (!nn || !market) continue
      if (!pikkitByName[nn]) pikkitByName[nn] = {}
      const existing = pikkitByName[nn][market]
      if (!existing || (r.game_key && canonGameKey(r.game_key) === gameKey && !existing.game_key)) pikkitByName[nn][market] = r
    }
    for (const p of [...game.homeLineup, ...game.awayLineup]) {
      const entry = resolveNameEntry(pikkitByName, normName(p.name))
      if (!entry) continue
      for (const [market, row] of Object.entries(entry)) {
        const picks = (row as any)?.picks
        if (typeof picks === 'number') gameTotalPicksByMarket[market] = (gameTotalPicksByMarket[market] ?? 0) + picks
      }
    }

    // Home batters face the away pitcher's hand, and vice versa. Missing
    // hand falls back to 'R' — same default the live route uses.
    const homePHand = (game.awayPitcher?.hand as 'L' | 'R') || 'R'
    const awayPHand = (game.homePitcher?.hand as 'L' | 'R') || 'R'
    const resolveBundle = (mlbId: number, name: string, pHand: 'L' | 'R', battingOrder: number): FieldBundle => {
      const nn = normName(name)
      return {
        props: resolveNameEntry(bdlByName, nn) || null,
        fhrAvg: resolveNameEntry(fhrAvgMap, nn),
        saAvg: resolveNameEntry(saAvgMap, nn),
        pitchlogWindows: pitchlogByBatter[mlbId]?.[pHand] ?? null,
        statcastWindows: statcastByBatter[mlbId]?.[pHand] ?? null,
        pikkitEntry: resolveNameEntry(pikkitByName, nn) ?? null,
        battingOrder,
      }
    }
    const homeBundle = new Map(game.homeLineup.map(p => [normName(p.name), resolveBundle(p.mlb_id, p.name, homePHand, p.batting_order)]))
    const awayBundle = new Map(game.awayLineup.map(p => [normName(p.name), resolveBundle(p.mlb_id, p.name, awayPHand, p.batting_order)]))

    return {
      game,
      gameKey,
      homeBundle,
      awayBundle,
      gameTotalPicksByMarket,
      noHr: {
        current: fanduelGapByName.__game__?.no_hr_fd ?? null,
        open: openingByName.__game__?.['noHr:fanduel'] ?? null,
      },
    }
  })
}

// ── Classic-mode 'tied' Factor support ──────────────────────────────────
// Mirrors dugout/data/route.ts's own tie-precompute block (lines
// ~1226-1281) exactly, extracted as a standalone function since this module
// deliberately never imports from that route file.
function buildTiedWinners(
  tiedFactors: MatrixFactor[],
  homeBundle: Map<string, FieldBundle>,
  awayBundle: Map<string, FieldBundle>,
  gameTotalPicksByMarket: Record<string, number>,
): Map<string, Set<string>> {
  const allBundle = new Map([...homeBundle, ...awayBundle])
  const factorTiedWinners = new Map<string, Set<string>>()
  const rootValue = (f: MatrixFactor, book: string | null, b: FieldBundle) => resolveFieldValue(f.category, f.field_key, f.recency, book, b, gameTotalPicksByMarket, f.mm_base_window, f.mm_compare_windows)
  const resolveTbValue = (name: string, tb: MatrixTiebreaker, pool: Map<string, FieldBundle>) => {
    const b = pool.get(name)
    return b ? resolveFieldValue(tb.category, tb.field_key, tb.recency, tb.book, b, gameTotalPicksByMarket, tb.mm_base_window, tb.mm_compare_windows) : null
  }
  const winnersForPool = (f: MatrixFactor, book: string | null, pool: Map<string, FieldBundle>): Set<string> => {
    const values = new Map<string, number>()
    for (const [name, b] of pool) {
      const v = rootValue(f, book, b)
      if (v != null) values.set(name, v)
    }
    const groups = filterTieGroups(groupTiedCandidates(values, f.field_key), f.tie_direction ?? null)
    const winners = new Set<string>()
    for (const group of groups.values()) {
      const survivors = f.tiebreakers?.length
        ? resolveTiebreakers(group, f.tiebreakers, (name, tb) => resolveTbValue(name, tb, pool))
        : new Set(group)
      for (const n of survivors) winners.add(n)
    }
    return winners
  }
  for (const f of tiedFactors) {
    const pools = f.tie_scope === 'game' ? [allBundle] : [homeBundle, awayBundle]
    if (f.category === 'odds') {
      const multi = MULTI_BOOK_MARKET[f.field_key]
      const books = multi && f.books?.length ? f.books : ['fanduel']
      const perBookWinners = books.map(book => {
        const combined = new Set<string>()
        for (const pool of pools) for (const n of winnersForPool(f, book, pool)) combined.add(n)
        return combined
      })
      const universe = new Set<string>()
      for (const pool of pools) for (const name of pool.keys()) universe.add(name)
      const finalWinners = new Set<string>()
      for (const name of universe) {
        const hits = perBookWinners.filter(s => s.has(name)).length
        const passes = multi && f.books_min_count != null ? hits >= f.books_min_count : hits === books.length
        if (passes) finalWinners.add(name)
      }
      factorTiedWinners.set(f.id, finalWinners)
    } else if (f.category === 'dugout_specs') {
      const combined = new Set<string>()
      for (const pool of pools) for (const n of winnersForPool(f, null, pool)) combined.add(n)
      factorTiedWinners.set(f.id, combined)
    }
  }
  return factorTiedWinners
}

function evaluateFactorForPlayer(
  f: MatrixFactor, bundle: FieldBundle, tiedWinners: Map<string, Set<string>>, name: string,
  gameTotalPicksByMarket: Record<string, number>,
): boolean {
  const isFactorTied = (factorId: string) => tiedWinners.get(factorId)?.has(name) ?? false
  if (f.category === 'odds') return evaluateOddsFactor(f, bundle.props, isFactorTied)
  if (f.category === 'dugout_specs') return evaluateDugoutSpecsFactor(f, bundle.props, bundle.fhrAvg, bundle.saAvg, isFactorTied)
  if (f.category === 'pitchlog_stat') return evaluatePitchlogFactorPrecomputed(f, bundle.pitchlogWindows)
  if (f.category === 'savant_stat') return evaluateSavantFactor(f, bundle.statcastWindows)
  return evaluatePicksFactor(f, bundle.pikkitEntry, gameTotalPicksByMarket)
}

// Returns the winning name_norms for one Matrix against one game's bundles,
// scope (team/game) already applied — same shape dugout/data/route.ts's own
// pipelineMatrixWinners/factorTiedWinners produce, just for an arbitrary
// historical date instead of "today."
export function evaluateMatrixForGame(matrix: Matrix, gb: GameBundles): Set<string> {
  if (matrix.matrix_type === 'pipeline') {
    const scope = matrix.pipeline_scope === 'game' ? 'game' : 'team'
    const allBundle = new Map([...gb.homeBundle, ...gb.awayBundle])
    const pools = scope === 'game' ? [allBundle] : [gb.homeBundle, gb.awayBundle]
    const combined = new Set<string>()
    for (const pool of pools) {
      let poolNames = new Set(pool.keys())
      // Same reasoning as dugout/data/route.ts's mirror of this block: an
      // 'unless' step's condition_scope='team' means "the same team this
      // pool already is" — `pool` itself, exactly — and falls back to the
      // whole game when the outer pipeline is already game-scoped.
      const scopeBundles = { team: pool, game: allBundle }
      for (const step of matrix.pipeline_steps) poolNames = runPipelineStep(poolNames, step, pool, gb.gameTotalPicksByMarket, scopeBundles)
      for (const n of poolNames) combined.add(n)
    }
    return combined
  }
  const tiedFactors = matrix.factors.filter(f => f.operator === 'tied')
  const tiedWinners = tiedFactors.length ? buildTiedWinners(tiedFactors, gb.homeBundle, gb.awayBundle, gb.gameTotalPicksByMarket) : new Map<string, Set<string>>()
  const winners = new Set<string>()
  const allBundle = new Map([...gb.homeBundle, ...gb.awayBundle])
  for (const [name, bundle] of allBundle) {
    if (evaluateMatrix(matrix, f => evaluateFactorForPlayer(f, bundle, tiedWinners, name, gb.gameTotalPicksByMarket))) winners.add(name)
  }
  return winners
}

// For a MISSED real HR hitter (a pipeline matrix only — classic Matrices
// have no ordered chain to walk), finds the first step where their name
// drops out of the real starting pool. No need to artificially force them
// back in between steps — if they were in the real universe to begin with,
// they're already there.
function findExclusionStep(matrix: Matrix, gb: GameBundles, name: string): number | null {
  if (matrix.matrix_type !== 'pipeline') return null
  const scope = matrix.pipeline_scope === 'game' ? 'game' : 'team'
  const allBundle = new Map([...gb.homeBundle, ...gb.awayBundle])
  const pool = scope === 'game' ? allBundle : (gb.homeBundle.has(name) ? gb.homeBundle : gb.awayBundle)
  if (!pool.has(name)) return null
  let poolNames = new Set(pool.keys())
  const scopeBundles = { team: pool, game: allBundle }
  for (let i = 0; i < matrix.pipeline_steps.length; i++) {
    poolNames = runPipelineStep(poolNames, matrix.pipeline_steps[i], pool, gb.gameTotalPicksByMarket, scopeBundles)
    if (!poolNames.has(name)) return i + 1 // 1-indexed step position
  }
  return null // survived every step — must have lost a tie/rank to someone else, or is a genuine flagged winner already
}

// ── Real box score outcomes ──────────────────────────────────────────────
// Standalone equivalent of dugout/data/route.ts's private fetchBoxscoreOutcomes
// — that function isn't exported, so this is a deliberate, small duplicate of
// a pure external-API read with no business logic (not a drift risk).
async function fetchRealHrHitters(games: TodayGame[]): Promise<Map<number, Map<number, { name: string; team: string }>>> {
  const byGamePk = new Map<number, Map<number, { name: string; team: string }>>()
  await Promise.all(games.map(async g => {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${g.gamePk}/feed/live`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      if (!r.ok) return
      const feed = await r.json()
      const teams = feed?.liveData?.boxscore?.teams
      if (!teams) return
      const hitters = new Map<number, { name: string; team: string }>()
      for (const side of ['home', 'away'] as const) {
        const players = teams[side]?.players ?? {}
        const teamAbbr = side === 'home' ? g.homeAbbr : g.awayAbbr
        for (const p of Object.values(players) as any[]) {
          const mlbId = p?.person?.id
          const hr = p?.stats?.batting?.homeRuns ?? 0
          if (mlbId && hr > 0) hitters.set(mlbId, { name: p.person.fullName, team: teamAbbr })
        }
      }
      byGamePk.set(g.gamePk, hitters)
    } catch { /* leave this game ungraded rather than fail the whole date */ }
  }))
  return byGamePk
}

// ── Grading ───────────────────────────────────────────────────────────────
export type BacktestMissDetail = { name: string; team: string; excludedAtStep: number | null }
export type BacktestGameResult = {
  gameKey: string; homeAbbr: string; awayAbbr: string
  lineupsConfirmed: boolean
  winners: { name: string; team: string; hit: boolean }[]
  actualHrHitters: { name: string; team: string }[]
  missDetails: BacktestMissDetail[]
}
export type BacktestDateResult = { date: string; games: BacktestGameResult[]; error?: string }

export async function runBacktestForDate(matrix: Matrix, date: string): Promise<BacktestDateResult> {
  try {
    const bundles = await fetchHistoricalGameBundles(date)
    if (!bundles.length) return { date, games: [] }
    const realHrByGamePk = await fetchRealHrHitters(bundles.map(b => b.game))

    const games: BacktestGameResult[] = bundles.map(gb => {
      // A past date's projected-lineup fallback would hit TODAY's live
      // roster, not the roster as of this historical date (call-ups/trades
      // since) — only trust confirmed lineups for backtesting.
      const lineupsConfirmed = gb.game.homeLineupConfirmed && gb.game.awayLineupConfirmed
      const nameByNorm = new Map<string, { name: string; team: string }>()
      for (const p of gb.game.homeLineup) nameByNorm.set(normName(p.name), { name: p.name, team: gb.game.homeAbbr })
      for (const p of gb.game.awayLineup) nameByNorm.set(normName(p.name), { name: p.name, team: gb.game.awayAbbr })

      const winnerNames = lineupsConfirmed ? evaluateMatrixForGame(matrix, gb) : new Set<string>()
      const realHitters = realHrByGamePk.get(gb.game.gamePk) ?? new Map()
      const realHitterNorms = new Set([...realHitters.values()].map(h => normName(h.name)))
      const winners = [...winnerNames].map(nn => ({ ...(nameByNorm.get(nn) ?? { name: nn, team: '?' }), hit: realHitterNorms.has(nn) }))

      const actualHrHitters = [...realHitters.values()]
      const missDetails: BacktestMissDetail[] = lineupsConfirmed
        ? [...realHitters.entries()]
            .filter(([, h]) => !winnerNames.has(normName(h.name)))
            .map(([, h]) => ({ name: h.name, team: h.team, excludedAtStep: findExclusionStep(matrix, gb, normName(h.name)) }))
        : actualHrHitters.map(h => ({ name: h.name, team: h.team, excludedAtStep: null }))

      return {
        gameKey: gb.gameKey, homeAbbr: gb.game.homeAbbr, awayAbbr: gb.game.awayAbbr,
        lineupsConfirmed, winners, actualHrHitters, missDetails,
      }
    })
    return { date, games }
  } catch {
    return { date, games: [], error: 'Backtest data is temporarily unavailable' }
  }
}

export type BacktestAggregate = {
  precision: number; recall: number; f1: number
  totalWinnerFlags: number; totalTruePositives: number; totalRealHrHitters: number
}
export type MatrixBacktestResult = { dates: BacktestDateResult[]; aggregate: BacktestAggregate }

// Bounded concurrency across dates — same pattern already established in
// matrixMatch.ts for per-batter fan-out (avoids opening an unbounded number
// of concurrent Supabase connections + MLB API calls for a multi-week range).
export async function runMatrixBacktest(matrix: Matrix, dates: string[]): Promise<MatrixBacktestResult> {
  const results = await asyncPool(4, dates, d => runBacktestForDate(matrix, d))

  let totalWinnerFlags = 0, totalTruePositives = 0, totalRealHrHitters = 0
  for (const d of results) {
    for (const g of d.games) {
      totalWinnerFlags += g.winners.length
      totalTruePositives += g.winners.filter(w => w.hit).length
      totalRealHrHitters += g.actualHrHitters.length
    }
  }
  const precision = totalWinnerFlags ? totalTruePositives / totalWinnerFlags : 0
  const recall = totalRealHrHitters ? totalTruePositives / totalRealHrHitters : 0
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0

  return { dates: results, aggregate: { precision, recall, f1, totalWinnerFlags, totalTruePositives, totalRealHrHitters } }
}
