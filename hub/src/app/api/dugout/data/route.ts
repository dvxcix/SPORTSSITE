import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { type BDLPropMap } from '@/lib/balldontlie'
import { createAdminClient } from '@/lib/supabase/admin'
import { normName, resolveNameEntry } from '@/lib/nameNorm'
import { getEffectiveTier } from '@/lib/requireTier'
import { hasTierAccess } from '@/lib/tiers'
import { fetchScheduleWithRetry } from '@/lib/mlbSchedule'
import { canonAbbr, canonGameKey } from '@/lib/teamAbbr'
import {
  fetchUserMatrices, fetchBulkBatterPitchRows,
  evaluateBatterMatrices, pitchlogNeeded, pitchlogCustomNeeded, asyncPool,
} from '@/lib/matrixMatch'
import { DUGOUT_STATCAST_TABLE } from '@/lib/dugoutStatcastPrecompute'
import type { StatcastWindow, StatcastLine } from '@/lib/dugoutStatcast'
import { MATCHUP_EDGE_TABLE } from '@/lib/dugoutMatchupEdgePrecompute'
import { DUGOUT_PITCHLOG_STAT_TABLE } from '@/lib/dugoutPitchlogStatPrecompute'
import type { PitchlogStatWindow, MatrixTiebreaker } from '@/lib/matrixEngine'
import {
  computeOddsRawPrice, computeDugoutSpecsValue, computePitchlogStatValue, computeSavantStatValue, computePicksValue,
  groupTiedCandidates, resolveTiebreakers, MULTI_BOOK_MARKET,
} from '@/lib/matrixEngine'
import type { BatterStats } from '@/lib/batterStatsEngine'

export const revalidate = 0
export const maxDuration = 60

// MLB's own schedule API isn't stable about which abbreviation it returns
// for a handful of teams — confirmed directly: Arizona came back as "ARI"
// at one point today and "AZ" a couple hours later from the exact same
// endpoint/hydration this route and the admin import dropdowns both use.
// That drift is invisible until it silently breaks a game_key match: the
// FanDuel gap-odds paste for AZ@LAD got stored under "ARI@LAD" while a
// later page load computes "AZ@LAD", so the two never look up as the same
// game and the admin's real, correctly-saved data just never merges in.
// Canonicalizing both sides (the live gameKey AND the stored game_key read
// back from the gap tables) to the same form fixes it regardless of which
// variant either side happened to use, without touching any stored rows.
// canonAbbr/canonGameKey now live in @/lib/teamAbbr — shared with the
// bdl-odds cron and fanduel-import so every producer of a game_key agrees
// on the same canonical form (see that file for the drift this fixes).

// A date strictly before today (ET) is DONE — the game(s) are over and
// nothing about that day's captured odds will ever change again. Real
// incident (2026-07-24): every date-scoped cache in this file used the
// SAME short revalidate window regardless of whether the date was today or
// three weeks ago, so fully-immutable historical data was being needlessly
// re-fetched from the DB every 60-300 seconds under load, all day, forever
// — reported live as past dates taking 1-2 minutes to load, which a purely
// historical read has no real reason to ever do. Anything keyed by a PAST
// date gets a week-long revalidate below (it will never actually need to
// refresh); TODAY still gets a short window since its data keeps changing
// through the day.
function isPastDateET(date: string): boolean {
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return date < todayEt
}
const WEEK_SECONDS = 60 * 60 * 24 * 7

// Temporary: real per-step timing for a live "today" request currently
// reported at ~41s (vs ~15s for a past date, same route) despite every
// known cache/duplicate-fetch bug already fixed and verified clean in
// runtime logs. Rather than ship another guessed fix, this logs how long
// each sequential step actually takes so the next live request pinpoints
// the real remaining bottleneck. Safe to leave in past the incident —
// console.log has no meaningful cost next to the awaits it's wrapping —
// but strip it once the slow step is identified and fixed.
function timed<T>(reqId: string, label: string, p: Promise<T>): Promise<T> {
  const start = Date.now()
  return p.finally(() => { console.log(`[dugout/data:${reqId}] ${label} ${Date.now() - start}ms`) })
}

// asyncPool (sliding-window concurrency pool) now lives in matrixMatch.ts,
// shared with fetchBulkBatterPitchRows/fetchBulkSavantSplits — the same
// per-batter chunk-and-wait straggler problem this fixed here also hit
// the precompute crons using those functions (confirmed live: a multi-
// date admin backfill hit Vercel's 300s maxDuration partway through).

// Manually-imported gap-odds reads — the only genuinely uncached Supabase
// queries in this route (everything else here either already goes through
// mpGet's own next:{revalidate} fetch caching, or is a deliberately-live
// in-game feed). Pure reads, zero write side effects (unlike the
// pregame_odds_snapshots freeze logic below, which stays fully live since
// its correctness depends on seeing the real current is_frozen value on
// every request) — safe to share across every caller regardless of tier.
// A real admin paste can land any time TODAY, so that window stays short;
// a past date is finalized (see isPastDateET above).
async function fetchGapOdds(date: string) {
  const admin = createAdminClient()
  const [{ data: fdRows }, { data: mgmRows }] = await Promise.all([
    admin.from('fanduel_gap_odds')
      .select('game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd, combo1_min, combo1_count, combo1_partners, combo2_min, combo2_count, combo2_partners')
      .eq('game_date', date)
      .range(0, 19999),
    admin.from('mgm_gap_odds')
      .select('game_key, name_norm, sa_mgm, hr2_mgm')
      .eq('game_date', date)
      .range(0, 19999),
  ])
  return { fdRows: fdRows ?? [], mgmRows: mgmRows ?? [] }
}
const getCachedGapOddsRecent = unstable_cache(fetchGapOdds, ['dugout-gap-odds-recent'], { revalidate: 60 })
const getCachedGapOddsHistorical = unstable_cache(fetchGapOdds, ['dugout-gap-odds-historical'], { revalidate: WEEK_SECONDS })
const getCachedGapOdds = (date: string) => (isPastDateET(date) ? getCachedGapOddsHistorical(date) : getCachedGapOddsRecent(date))

// Opening baselines now come from the unified market_opening_prices table
// (see /api/cron/bdl-odds and /api/admin/fanduel-import) instead of the old
// fanduel_gap_odds_opening/mgm_gap_odds_opening — those tables' own capture
// logic had a real bug (existence-checked per GAME instead of per MARKET, so
// the first pass of the day permanently locked out every market FanDuel
// doesn't post until later) and had no concept of a BDL-sourced opener at
// all. Whichever pipeline observed a real price for a given (game, player,
// market, BOOK) FIRST is what's stored here. BetMGM is included on equal
// footing, not carved out — its current price already comes straight
// through BDL (props.sa.betmgm/props.hr2.betmgm, see DugoutClient's
// sa_mgm/hr2_mgm), not a separate scrape, so its opener gets the exact same
// first-observation-wins treatment as every other book.
// Real incident (2026-07-24): this used to cache the RAW flat row array
// (17,376 rows for one day's slate — confirmed live) and let the caller
// reduce it to the actual compact lookup shape afterward. Next's
// unstable_cache silently refuses to write any single cached value over
// 2MB — no error thrown, just a console warning and a cache MISS forever —
// and a full slate's worth of verbose {game_key, name_norm, market, book,
// opening_price} rows serializes well past that ceiling. Every request was
// therefore repaying this entire paginated fetch live, which is exactly
// what was timing out at Vercel's 60s function limit under concurrent
// traffic. Aggregating into the same nested (game_key -> name_norm ->
// "market:book" -> price) map the caller always reduced it to anyway — a
// real slate's worth of actual players/markets, not every raw row — keeps
// this comfortably under the cache size limit so it actually caches again.
async function fetchGapOddsOpening(date: string) {
  const admin = createAdminClient()
  // A single `.range(0, 19999)` call silently came back capped at 1000
  // rows (confirmed live: 6,400 real opening-price rows for one day's
  // slate, only 1,000 ever returned) — Supabase's project-level PostgREST
  // max-rows setting overrides whatever range a client asks for, and with
  // no ORDER BY the surviving 1,000 rows are effectively arbitrary. That
  // silently starved out whichever markets/books/players didn't happen to
  // land in that slice — confirmed live as the root cause of "no delta
  // arrows" reports that were inconsistent across markets and players
  // with no code-level explanation. Paging through in fixed-size batches
  // guarantees every row is actually read regardless of that server cap.
  const openingByGameKey: Record<string, Record<string, Record<string, number>>> = {}
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await admin
      .from('market_opening_prices')
      .select('game_key, name_norm, market, book, opening_price')
      .eq('game_date', date)
      .range(offset, offset + PAGE - 1)
    if (!data?.length) break
    for (const r of data) {
      const byName = (openingByGameKey[canonGameKey(r.game_key)] ??= {})
      ;(byName[r.name_norm] ??= {})[`${r.market}:${r.book}`] = Number(r.opening_price)
    }
    if (data.length < PAGE) break
  }
  return { openingByGameKey }
}
// An "opening" price is, by definition, the FIRST quote ever captured for
// that (game, player, market, book) — write-once. New rows can still
// APPEND throughout TODAY as markets that haven't posted yet finally do,
// so today keeps a short window; a PAST date's openers are all fully
// captured already and will never gain or change a row again (see
// isPastDateET above) — no real reason to ever re-fetch that from the DB.
const getCachedGapOddsOpeningRecent = unstable_cache(fetchGapOddsOpening, ['dugout-gap-odds-opening-recent'], { revalidate: 60 })
// '-v2' (2026-07-24): market_opening_prices only started getting written
// 2026-07-23 — any past date before that had zero rows here until a one-time
// backfill from the old fanduel_gap_odds_opening/mgm_gap_odds_opening tables
// ran today. A viewer who loaded one of those dates earlier today, before
// the backfill, would have this WEEK_SECONDS cache permanently pinned to an
// empty result under the old key. Bumping the key busts that stale entry;
// no other reason to ever bump it again after this.
const getCachedGapOddsOpeningHistorical = unstable_cache(fetchGapOddsOpening, ['dugout-gap-odds-opening-historical-v2'], { revalidate: WEEK_SECONDS })
const getCachedGapOddsOpening = (date: string) => (isPastDateET(date) ? getCachedGapOddsOpeningHistorical(date) : getCachedGapOddsOpeningRecent(date))

// Custom Matrix's own bulk read — full-season pitch-by-pitch rows for every
// batter in today's lineups, needed only by pitchlog_stat Factors (arbitrary
// recency windows over raw per-pitch data, something the cron-precomputed
// Statcast table doesn't cover). Skipped entirely server-side (see call
// site) when no signed-in member's Matrices actually reference pitchlog_stat.
// savant_stat Factors need no equivalent live fetch at all anymore — they
// read the same precomputedStatcastByBatter this route already builds below
// for the Dugout grid's own Statcast section (see evaluateSavantFactor in
// matrixEngine.ts for why that's correct, not just faster).
//
// Real incident (2026-07-24): this used to be ONE unstable_cache entry
// keyed by (date, the whole batterIds array), bundling every lineup
// batter's full season of pitches into a single cached value — confirmed
// live at 30.9MB for one date, wildly past Next's hard (non-configurable)
// 2MB-per-entry cache limit. That failure is silent (a console warning,
// not an error), so every request was repaying this entire bulk fetch
// live, every time, with zero caching benefit — real concurrent load on
// top of an already-heavy query. Caching PER BATTER instead (~2,000
// pitches worst-case per player, comfortably under the limit) fixes the
// size problem AND is strictly better sharing: a batter's cached rows are
// now reusable across ANY date within the revalidate window, not just the
// one exact date + exact batterIds-array combination that happened to
// match before.
// Real incident (2026-07-24): this used a 300s (5-minute) revalidate window,
// but player_pitch_log only ever changes once daily via the savant-sync-
// pitch-log cron — same real freshness cadence already established for the
// per-player /api/players/[id]/pitch-log cache (see that route's own
// comment). A 5-minute window meant every batter's cache went cold and had
// to be fully re-fetched every 5 minutes, all day, regardless of whether
// the cron had run — confirmed live via runtime logs: repeated 28-56s
// request totals, every one dominated by this exact fetch, recurring every
// few minutes rather than a one-time cost. Reusing the SAME 'player-pitch-
// log' tag that savant-sync-pitch-log already calls revalidateTag() on
// means this now invalidates in lockstep with real data changes instead of
// an arbitrary short timer — once warm, a batter's rows stay warm all day.
const getCachedBatterPitchRows = unstable_cache(
  async (batterId: number) => fetchBulkBatterPitchRows(createAdminClient(), [batterId]),
  ['dugout-matrix-pitchlog-batter'],
  { revalidate: 86400, tags: ['player-pitch-log'] }
)

// Confirmed live (2026-07-24): before lineups post for a date (including
// "today" ahead of first pitch), the grid falls back to each team's
// projected/active-roster lineup (fetchProjectedLineup below — function
// declarations hoist, so referencing it here is safe despite appearing
// first textually) — 2 live MLB fetches per team needing it. The first
// version of this fix resolved that per-team, per-REQUEST: correct, but it
// reran that whole concurrent fetch burst for every single viewer, which
// reintroduced the exact "endless load" this session already fixed once.
// This data (schedule + whichever lineups are confirmed vs. need the
// projected-roster fallback) is a pure function of the DATE, never of
// which member is asking — cached as ONE bundle per date instead, so the
// first request of a ~5-minute window pays this cost and every other
// concurrent viewer of that same date gets a plain cache read. Refetches
// the schedule inside here rather than accepting it as an argument: MLB's
// raw schedule payload isn't a stable cache key (irrelevant per-request
// fields would bust the cache every time), where the date string is.
async function fetchDateLineupResolution(dateKey: string) {
  const games = await fetchScheduleWithRetry(dateKey, 'lineups,probablePitcher,team,linescore,venue')
  const allDisplayedBatterIds = new Set<number>()
  for (const g of games) {
    for (const p of [...(g.lineups?.homePlayers || []), ...(g.lineups?.awayPlayers || [])]) {
      if (p?.id) allDisplayedBatterIds.add(p.id)
    }
  }
  const projectedByTeamId: Record<number, any[]> = {}
  await Promise.all(games.map(async (g: any) => {
    const needsHome = !(g.lineups?.homePlayers?.length)
    const needsAway = !(g.lineups?.awayPlayers?.length)
    if (!needsHome && !needsAway) return
    const homeTeam = g.teams?.home?.team?.name || ''
    const awayTeam = g.teams?.away?.team?.name || ''
    const homeAbbr = g.teams?.home?.team?.abbreviation || homeTeam.split(' ').pop() || ''
    const awayAbbr = g.teams?.away?.team?.abbreviation || awayTeam.split(' ').pop() || ''
    const homeTeamId = g.teams?.home?.team?.id
    const awayTeamId = g.teams?.away?.team?.id
    const [homeProj, awayProj] = await Promise.all([
      needsHome && homeTeamId ? fetchProjectedLineup(homeTeamId, homeAbbr, homeTeam) : Promise.resolve(null),
      needsAway && awayTeamId ? fetchProjectedLineup(awayTeamId, awayAbbr, awayTeam) : Promise.resolve(null),
    ])
    if (homeProj) { projectedByTeamId[homeTeamId] = homeProj; for (const p of homeProj) if (p.mlb_id) allDisplayedBatterIds.add(p.mlb_id) }
    if (awayProj) { projectedByTeamId[awayTeamId] = awayProj; for (const p of awayProj) if (p.mlb_id) allDisplayedBatterIds.add(p.mlb_id) }
  }))
  return { allDisplayedBatterIds: Array.from(allDisplayedBatterIds), projectedByTeamId }
}
// A past date's real lineups are 100% final — the games already happened.
// Only TODAY still needs the shorter window (lineups moving from
// unconfirmed/projected to confirmed as the day goes on); see isPastDateET.
const getCachedDateLineupResolutionRecent = unstable_cache(fetchDateLineupResolution, ['dugout-date-lineup-resolution-recent'], { revalidate: 300 })
const getCachedDateLineupResolutionHistorical = unstable_cache(fetchDateLineupResolution, ['dugout-date-lineup-resolution-historical'], { revalidate: WEEK_SECONDS })
const getCachedDateLineupResolution = (date: string) => (isPastDateET(date) ? getCachedDateLineupResolutionHistorical(date) : getCachedDateLineupResolutionRecent(date))

// Real incident (2026-07-24): this exact same MLB schedule fetch (same
// date, same hydrate string) was ALSO being requested a second time,
// completely uncached, further down in this route (for the full game
// objects — scores, live status, venue — that getCachedDateLineupResolution
// doesn't return). That meant every single one of ~25 concurrent viewers
// loading "today" independently hit MLB's live API on every request,
// bypassing every caching fix above entirely — very likely THE dominant
// source of "why isn't this instant with barely two dozen people online."
// A past date's game objects (final score, Final status) are as
// permanently frozen as everything else historical; today's genuinely
// needs to stay fresh (live score/status), so that gets a short window —
// still shared across every concurrent viewer within it, instead of paid
// by every single one of them individually.
const getCachedScheduleRecent = unstable_cache(
  (date: string) => fetchScheduleWithRetry(date, 'lineups,probablePitcher,team,linescore,venue'),
  ['dugout-schedule-recent'], { revalidate: 15 }
)
const getCachedScheduleHistorical = unstable_cache(
  (date: string) => fetchScheduleWithRetry(date, 'lineups,probablePitcher,team,linescore,venue'),
  ['dugout-schedule-historical'], { revalidate: WEEK_SECONDS }
)
const getCachedSchedule = (date: string) => (isPastDateET(date) ? getCachedScheduleHistorical(date) : getCachedScheduleRecent(date))

// `${market}:${book}` -> the camelCase field name already used on
// entry.open.* throughout this route and consumed by BatterCostClient/
// DugoutClient. Existing *Fd-suffixed fanduel names are kept as-is so no
// client change was needed for the markets that already had opening
// tracking; hits/hits2/runs/runs2/stolenBases/stolenBases2 are new — these
// had ZERO opening/delta tracking anywhere before this table. sa:betmgm/
// hr2:betmgm revive the saMgm/hr2Mgm fields DugoutClient's OddsCell already
// reads, now sourced from BDL's own live betmgm price instead of the old
// paused mgm-import scrape. fhr:caesars/sa:caesars/fhr:fanatics/
// sa:betrivers/sa:fanatics back OddsCells Dugout already renders (or, for
// sa:fanatics, gets a brand-new column for, matching the 3-book FHR row's
// existing fanatics coverage) — real opener data for all of these was
// already flowing into market_opening_prices but silently dropped here
// since nothing mapped it to a client field (confirmed live, reported
// 2026-07-23). Every other still-unmapped book (draftkings on markets
// with no current-price cell to attach a delta to) stays captured in the
// table for future use, just not yet surfaced to a client field.
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

// ── mlb-party Supabase ────────────────────────────────────────────────────────
const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
// Was hardcoded here (and in api/admin/pikkit-import/route.ts) — a live
// service_role key with full DB access baked straight into committed source
// is a real exposure risk the moment this repo is anywhere a wider audience
// can read it. Read from env instead; see .env.local for the value.
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }

async function mpGet(path: string, cache = 3600, range?: string): Promise<any[]> {
  try {
    const headers = range ? { ...mpH, Range: range } : mpH
    const res = await fetch(`${MP_URL}${path}`, { headers, next: { revalidate: cache } })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// A `Range` header does NOT bypass this project's real per-request cap —
// verified against production logs: every one of the "big" mlb-party
// fetches came back at EXACTLY 1000 rows regardless of what Range was
// requested (a prior fix here for fetchBatterPitchEvents assumed Range
// worked and was apparently never actually checked against a large-enough
// result set to notice it didn't). The only thing that reliably proves
// you've reached the end is a page coming back SHORTER than the page size
// — so loop on that instead of guessing a big-enough single request.
async function mpGetAll(path: string, cache = 3600): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    const page = await mpGet(path, cache, `${offset}-${offset + PAGE - 1}`)
    out.push(...page)
    if (page.length < PAGE) break
  }
  return out
}

async function mpRpc(fn: string, body: any): Promise<any[]> {
  try {
    const res = await fetch(`${MP_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...mpH, Range: '0-4999' },
      body: JSON.stringify(body),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// Bypasses get_fhr_history_avg/get_sa_history_avg entirely for the two
// season-average maps. Confirmed live (2026-07-21) via a direct per-name
// probe: those RPCs silently cap at exactly 1000 rows (~500 of the ~900+
// rostered players) with NO working offset pagination — Range headers on
// the RPC endpoint returned the identical first-1000-rows on every page,
// while a direct exact-name filter against the underlying table found
// fresh same-day data for players the RPC was dropping (Trea Turner,
// Willson Contreras, Wilyer Abreu, Vladimir Guerrero Jr. — all present and
// current, just never reaching the RPC's response). The underlying table
// paginates correctly via the same Range-header mechanism mpGetAll already
// uses for every other table in this file, so this reads it directly:
// one row per (name_norm, bookmaker, market_key, through_date), filtered to
// the target market + the two bookmakers actually charted, then keeps only
// the most recent through_date per (name_norm, bookmaker) — the same
// "latest observation on or before the target date" semantics the RPC was
// meant to provide. Shape (name_norm, bookmaker, avg_price) matches exactly
// what DugoutClient.tsx's fhrAvgMap/saAvgMap already expect, so no client
// change is needed.
async function fetchSeasonAvgDirect(marketKey: string, date: string): Promise<any[]> {
  const cutoff = new Date(`${date}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() + 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const rows = await mpGetAll(
    `/rest/v1/player_price_season_avg?select=name_norm,bookmaker,avg_price,through_date&market_key=eq.${marketKey}&bookmaker=in.(fanduel,williamhill_us)&through_date=lte.${cutoffStr}`,
    3600
  )
  const latest = new Map<string, any>()
  for (const r of rows) {
    const key = `${r.name_norm}|${r.bookmaker}`
    const existing = latest.get(key)
    if (!existing || r.through_date > existing.through_date) latest.set(key, r)
  }
  return Array.from(latest.values())
}

const STAT_COLS = 'mlb_id,name_norm,pitch_hand,win,avg_bat_speed,hard_swing_rate,squared_up_per_swing,blast_per_swing,swing_length,attack_angle,ideal_attack_angle_rate,swing_tilt,exit_velocity_avg,launch_angle_avg,barrel_batted_rate,hard_hit_pct,pull_air_rate,fb_rate,xhr,hr_total,avg_hr_distance'
const TIME_COLS = 'mlb_id,name_norm,pitch_hand,pitch_type,win,miss_distance,on_time_percent,n_swings'

async function fetchStatSplits() {
  return mpGetAll(`/rest/v1/batter_statcast_splits?select=${STAT_COLS}`, 3600)
}

async function fetchTimingSplits() {
  return mpGetAll(`/rest/v1/batter_timing_splits?select=${TIME_COLS}`, 3600)
}

async function fetchPitcherSplits(mlbIds: number[]) {
  if (!mlbIds.length) return []
  return mpGet(`/rest/v1/pitcher_statcast_splits?mlb_id=in.(${mlbIds.join(',')})&select=*`)
}

// Paper's matchup_edge/platoon_ops inputs — formerly mlb-party's
// batter_pitch_type_recent/pitcher_pitch_type_recent/batter_platoon_splits,
// all three confirmed silently stuck (2026-07-24: two hadn't written a new
// row since Jul 14; the third's own daily cron kept "succeeding" while its
// computed window stayed frozen at Jul 9). Replaced with our own
// dugout_matchup_edge_precomputed table — see dugoutMatchupEdgePrecompute.ts —
// read below alongside the Statcast precompute.

// Live HR feed — pulled fresh from MLB's playByPlay per live/final game, same
// approach as mlb-party's builder, but enriched with hitData (exit velo,
// launch angle, distance) and the pitcher who allowed it — mlb-party's own
// feed only carries batter/inning/description, no hit or pitcher detail.
async function fetchHrFeed(mlbGames: any[]): Promise<{ hrFeed: any[]; pitcherIdByName: Record<string, number> }> {
  const livePks = mlbGames
    .filter((g: any) => { const s = g.status?.abstractGameState; return s === 'Live' || s === 'Final' })
    .map((g: any) => g.gamePk)
    .filter(Boolean)
  if (!livePks.length) return { hrFeed: [], pitcherIdByName: {} }

  // pitcherIdByName is built from EVERY play in the same playByPlay response
  // (not just home runs) — near_hrs (the "almost a HR" feed queried below)
  // only ever carries pitcher_name, no id, so there's no headshot for it
  // otherwise. Reusing this already-fetched data costs zero extra requests.
  const pitcherIdByName: Record<string, number> = {}

  const results = await Promise.all(livePks.map(async (pk: number) => {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/game/${pk}/playByPlay`, { cache: 'no-store' })
      if (!r.ok) return []
      const d = await r.json()
      const plays: any[] = d.allPlays || []
      for (const p of plays) {
        const pid = p.matchup?.pitcher?.id
        const pname = p.matchup?.pitcher?.fullName
        if (pid && pname) pitcherIdByName[normName(pname)] = pid
      }
      return plays
        .filter(p => p.result?.eventType === 'home_run')
        .map(p => {
          const hitEvent = (p.playEvents || []).find((e: any) => e.details?.isInPlay && e.hitData)
          return {
            game_pk: pk,
            player_name: p.matchup?.batter?.fullName || '',
            name_norm: normName(p.matchup?.batter?.fullName || ''),
            mlb_id: p.matchup?.batter?.id || null,
            pitcher_name: p.matchup?.pitcher?.fullName || null,
            pitcher_mlb_id: p.matchup?.pitcher?.id || null,
            inning: p.about?.inning,
            half: p.about?.halfInning,
            is_first_hr_of_game: false, // filled below
            ab_index: p.atBatIndex ?? 0,
            desc: p.result?.description || '',
            exit_velocity: hitEvent?.hitData?.launchSpeed ?? null,
            launch_angle: hitEvent?.hitData?.launchAngle ?? null,
            hit_distance: hitEvent?.hitData?.totalDistance ?? null,
            // Real wall-clock moment the HR happened — needed to sort
            // "Today's Home Runs" chronologically ACROSS games. ab_index only
            // orders at-bats within one game; two games' at-bats have no
            // relationship to each other, so sorting by ab_index (or game_pk)
            // groups everything by game first instead of real slate order.
            hr_time: p.about?.endTime ?? p.about?.startTime ?? null,
          }
        })
    } catch { return [] }
  }))

  const hrFeed = ([] as any[]).concat(...results)
  const byGame: Record<number, any[]> = {}
  for (const h of hrFeed) { (byGame[h.game_pk] ??= []).push(h) }
  for (const pk of Object.keys(byGame)) {
    const arr = byGame[Number(pk)].sort((a, b) => a.ab_index - b.ab_index)
    if (arr[0]) arr[0].is_first_hr_of_game = true
  }
  return { hrFeed, pitcherIdByName }
}

// Real per-player box score outcomes for live/final games — same MLB
// endpoint (feed/live) hub/src/lib/pickGrading.ts already uses to grade
// real picks win/loss, reused here so The Public's outcome heatmap grades
// identically to how a pick itself settles. fetchHrFeed above hits the
// lighter playByPlay endpoint instead, which has no aggregated batting line
// at all — this needs the actual box score, not just play events.
async function fetchBoxscoreOutcomes(mlbGames: any[]): Promise<Record<number, Record<number, any>>> {
  const gradedPks = mlbGames
    .filter((g: any) => { const s = g.status?.abstractGameState; return s === 'Live' || s === 'Final' })
    .map((g: any) => g.gamePk)
    .filter(Boolean)
  if (!gradedPks.length) return {}

  const byGamePk: Record<number, Record<number, any>> = {}
  await Promise.all(gradedPks.map(async (pk: number) => {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live`, { cache: 'no-store' })
      if (!r.ok) return
      const feed = await r.json()
      const teams = feed?.liveData?.boxscore?.teams
      if (!teams) return
      const byMlbId: Record<number, any> = {}
      for (const side of ['home', 'away']) {
        const players = teams[side]?.players ?? {}
        for (const p of Object.values(players) as any[]) {
          const mlbId = p?.person?.id
          const b = p?.stats?.batting
          if (!mlbId || !b) continue
          const h = b.hits ?? 0
          const doubles = b.doubles ?? 0
          const triples = b.triples ?? 0
          const hr = b.homeRuns ?? 0
          const rbi = b.rbi ?? 0
          const runs = b.runs ?? 0
          byMlbId[mlbId] = {
            h, doubles, triples, hr, rbi, runs,
            singles: h - doubles - triples - hr,
            tb: b.totalBases ?? 0,
            sb: b.stolenBases ?? 0,
            hrr: h + runs + rbi,
          }
        }
      }
      byGamePk[pk] = byMlbId
    } catch {}
  }))
  return byGamePk
}

// Position priority for projected lineup ordering
const POS_ORDER: Record<string, number> = {
  C:2, '1B':3, '2B':4, '3B':5, SS:6,
  LF:7, CF:8, RF:9, DH:1, OF:7, INF:4,
}

async function fetchProjectedLineup(teamId: number, teamAbbr: string, teamName: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`,
      { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const roster: any[] = data.roster ?? []
    const positionPlayers = roster.filter(p => p.position?.type !== 'Pitcher')

    // teams/{id}/roster's `person` objects never carry batSide at all —
    // confirmed live, every entry comes back undefined, not just missing
    // for switch hitters or some edge case. Every projected/unconfirmed
    // batter was silently defaulting to bats: '?', which a downstream
    // `bats === 'S' ? ... : bats === 'L' ? 'L' : 'R'`-style fallback then
    // treats as right-handed — so an entire projected lineup could show
    // zero LHB/switch hitters even when several were actually on it.
    // Batch-fetch it the same way the confirmed-lineup path already does
    // (see batSideById above) rather than trusting this endpoint for it.
    const ids = positionPlayers.map(p => p.person?.id).filter(Boolean)
    const projBatSideById = new Map<number, string>()
    if (ids.length) {
      try {
        const peopleRes = await fetch(
          `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(',')}`,
          { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
        )
        if (peopleRes.ok) {
          const people = (await peopleRes.json()).people ?? []
          for (const person of people) {
            const code = person.batSide?.code
            if (person.id && code) projBatSideById.set(person.id, code)
          }
        }
      } catch {}
    }

    return positionPlayers
      .sort((a, b) => (POS_ORDER[a.position?.abbreviation] ?? 9) - (POS_ORDER[b.position?.abbreviation] ?? 9))
      .map((p, i) => ({
        mlb_id: p.person.id,
        name: p.person.fullName || '',
        name_norm: normName(p.person.fullName || ''),
        batting_order: i + 1,
        position: p.position?.abbreviation || '?',
        bats: projBatSideById.get(p.person.id) || p.person.batSide?.code || '?',
        team: teamAbbr,
        team_name: teamName,
        projected: true,
      }))
  } catch { return [] }
}

// This route is shared by four pages with DIFFERENT real tier floors —
// Pitcher Report ('basic'), The Public ('advanced'), Dugout/Batter Cost
// ('ultimate') — plus three admin-only import forms (which always resolve
// to 'ultimate' via the admin full-access override, see getEffectiveTier).
// A single flat requireTier('ultimate') here used to silently 403 every
// Pitcher Report request from Basic/Advanced members (confirmed live: the
// page's own TierGate said 'basic', but every fetch to this endpoint
// rejected below Ultimate) and blocked The Public from ever being anything
// but Ultimate-exclusive. Rather than gating the whole response, this now
// rejects only below the lowest real floor ('basic') and then computes/
// includes each field only for the tier that's actually supposed to see
// it — Statcast splits, HR feeds, season averages, opening-line deltas,
// and pitcher/lineup live odds (`.props`, `.props.open`) stay genuinely
// Ultimate-exclusive; Pitcher Report's basic-tier fields (schedule,
// lineups without props, pitch-type recency, Statcast splits, pikkit) are
// always computed; The Public's advanced-tier needs (lineup `.props` for
// pricing, real box-score `outcomes`) are added on top of that floor.
export async function GET(req: Request) {
  const gate = await getEffectiveTier()
  if (gate.error) return gate.error
  const tier = gate.tier!
  if (!hasTierAccess(tier, 'basic')) {
    return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
  }
  const isAdvancedPlus = hasTierAccess(tier, 'advanced')
  const isUltimate = hasTierAccess(tier, 'ultimate')

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const reqId = Math.random().toString(36).slice(2, 8)
  const reqStart = Date.now()
  console.log(`[dugout/data:${reqId}] start date=${date} isToday=${!isPastDateET(date)} tier=${tier}`)
  // If the service-role key isn't configured, degrade gracefully: skip
  // snapshot lookup entirely rather than 500ing the whole page (odds just
  // won't populate — everything else on the page still works).
  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { admin = null }

  // 1. MLB schedule + lineup resolution — genuinely independent of each
  // other (both keyed only by `date`, neither reads the other's result), so
  // they run concurrently instead of the prior one-after-another awaits.
  // NOTE: fetchDateLineupResolution (see its definition above) does its own
  // SEPARATE raw fetchScheduleWithRetry call, under its own 300s cache
  // window, distinct from getCachedSchedule's 15s window — this is a real,
  // still-unresolved duplicate-fetch path (not the one already fixed
  // earlier this session) and a likely contributor to "today" specifically
  // being slow; the `schedule`/`lineupResolution` timings below will show
  // whether either one is actually the bottleneck on a live cache miss.
  const [scheduleResult, lineupResolution] = await Promise.all([
    timed(reqId, 'schedule', (async () => { try { return await getCachedSchedule(date) } catch { return [] as any[] } })()),
    timed(reqId, 'lineupResolution', getCachedDateLineupResolution(date)),
  ])
  const mlbGames: any[] = scheduleResult
  const { allDisplayedBatterIds: allDisplayedBatterIdList, projectedByTeamId } = lineupResolution

  const lineupBatterIds = new Set<number>()
  for (const g of mlbGames) {
    for (const p of [...(g.lineups?.homePlayers || []), ...(g.lineups?.awayPlayers || [])]) {
      if (p?.id) lineupBatterIds.add(p.id)
    }
  }
  const lineupBatterIdList = Array.from(lineupBatterIds)

  // Custom Matrix — a signed-in Ultimate member's own saved highlight rules.
  // Fetched once, up front: small (≤10 Matrices/≤40 Factors each, capped at
  // both the app and DB level), so always fetching it for an eligible caller
  // is cheap.
  const userMatrices = isUltimate && admin && gate.userId ? await timed(reqId, 'userMatrices', fetchUserMatrices(admin, gate.userId)) : []

  // MLB's schedule?hydrate=lineups CONFIRMED-lineup player objects carry only
  // id/name/position — no batSide at all. Every batter was silently falling
  // back to '?' (shown as "?HB" in the UI) once lineups posted, which also
  // broke every hand-dependent computation downstream (platoon splits,
  // matchup_edge, the pitcherHand fallback chain) since those all key off
  // this same field. Only the unconfirmed/projected-lineup fallback path
  // (which hits the roster endpoint instead) ever had real hand data. Batch-
  // fetch real batSide for every confirmed-lineup player via the people
  // endpoint, which does carry it.
  // Custom Matrix's own bulk pitch-log read — gated to only whether a
  // signed-in member's OWN saved Factors reference pitchlog_stat at all,
  // same as before the Statcast section existed. savant_stat Factors need
  // no equivalent gate/fetch anymore — they read the precomputed Statcast
  // rows fetched below regardless (already needed for the grid's own
  // Statcast section), so there's nothing left to conditionally fetch here
  // for that category.
  const needsPitchlog = pitchlogNeeded(userMatrices)
  // 'custom' recency (an arbitrary exact date range) is the only
  // pitchlog_stat case the daily precompute below can't cover — see
  // evaluatePitchlogFactorPrecomputed's own comment. Confirmed live
  // (2026-07-24): none of the real members who hit the old 28-56s
  // matrixPitchRows spike actually used 'custom' — this should gate the
  // expensive live per-batter raw fetch to near-nobody in practice.
  const needsPitchlogCustom = pitchlogCustomNeeded(userMatrices)

  // Pitcher IDs only need the schedule (already have it) — computed here,
  // ahead of the big parallel batch below, so pitcherHandById/pitcherSplits
  // can join that same batch instead of waiting on it afterward.
  const pitcherIds = new Set<number>()
  for (const g of mlbGames) {
    const hp = g.teams?.home?.probablePitcher?.id
    const ap = g.teams?.away?.probablePitcher?.id
    if (hp) pitcherIds.add(hp)
    if (ap) pitcherIds.add(ap)
  }
  const pitcherIdList = Array.from(pitcherIds)
  const gamePksToday = mlbGames.map((g: any) => String(g.gamePk))

  // Real incident (2026-07-24): every one of the fetches below is
  // independent of every other one — none reads another's result, only
  // `date`/`mlbGames`/`admin`/tier flags, all already available above — yet
  // they were previously run as a chain of separate `await`s, one after
  // another (this whole group, THEN gap odds, THEN opening prices, THEN
  // pitcherHandById, THEN pitcher splits, THEN the freeze lookup), on top of
  // batSideById ALSO awaited separately before all of it. A live "today"
  // request pays the FULL latency of every one of those round-trips added
  // together, back to back, even though none of them ever needed to wait
  // for any other — the leading suspect for "why is today ~3x slower than
  // an old date" (old dates hit the same chain, but every entry in it is
  // long-since cached under the WEEK_SECONDS historical window, so each
  // sequential `await` resolves near-instantly; today's short windows and
  // deliberately-live entries (hrFeed/boxscoreOutcomes) make each link in
  // that chain a real network round-trip far more often). One Promise.all
  // means the added time is whichever ONE of these is slowest, not the sum
  // of all of them. The `timed()` wrapper on each entry logs real
  // per-request timings so the next live "today" load shows exactly which
  // one (if any) is still the dominant cost.
  const [
    statSplits, timingSplits, pikkit, fhrAvg, saAvg, openingSaRbi, hrFeedResult, nearHrRaw, outcomesByGamePk,
    matrixPitchRowsByBatter, precomputedStatcastRows, precomputedPitchlogRows, precomputedMatchupEdgeRows,
    batSideEntries, gapOddsResult, gapOddsOpeningResult, pitcherHandEntries, pitcherSplits, freezeResult,
  ] = await Promise.all([
    timed(reqId, 'statSplits', fetchStatSplits()),
    timed(reqId, 'timingSplits', fetchTimingSplits()),
    // A single mpGet() (no pagination) silently caps at the same per-request
    // row limit already worked around elsewhere in this file (see mpGetAll's
    // own comment, and the FanDuel gap-odds .range() fix) — confirmed today:
    // 1237 pikkit rows exist for one date, past that cap, and whichever rows
    // fell past it just vanished with no error. Symptom looked identical to
    // the AZ@LAD game-key bug (a real upload "not showing"), but this one
    // was a straight truncation, unrelated to which game the picks belonged
    // to — any game whose rows happened to land past the cutoff lost them.
    timed(reqId, 'pikkit', mpGetAll(`/rest/v1/pikkit_public_picks?game_date=eq.${date}&select=player_name,picks,prop_type,game_key`, 300)),
    timed(reqId, 'fhrAvg', isUltimate ? fetchSeasonAvgDirect('batter_first_home_run', date) : Promise.resolve([])),
    timed(reqId, 'saAvg', isUltimate ? fetchSeasonAvgDirect('batter_home_runs', date) : Promise.resolve([])),
    timed(reqId, 'openingSaRbi', isUltimate ? mpRpc('get_opening_sa_rbi', { p_date: date }) : Promise.resolve([])),
    timed(reqId, 'hrFeed', isUltimate ? fetchHrFeed(mlbGames) : Promise.resolve({ hrFeed: [] as any[], pitcherIdByName: {} as Record<string, number> })),
    timed(reqId, 'nearHr', isUltimate ? mpGet(`/rest/v1/near_hrs?game_date=eq.${date}&select=batter_name,batter_id,pitcher_name,pitch_type,pitch_speed,result,inning,half_inning,exit_velocity,launch_angle,hit_distance,hit_bearing,parks_hr_count,home_team,away_team,captured_at&order=parks_hr_count.desc&limit=200`, 30) : Promise.resolve([])),
    timed(reqId, 'boxscoreOutcomes', isAdvancedPlus ? fetchBoxscoreOutcomes(mlbGames) : Promise.resolve({} as Record<number, Record<number, any>>)),
    // Real incident (2026-07-24, confirmed live via runtime logs on a
    // production request that took 40.9s total, dominated by this exact
    // step at 40.5s): firing one getCachedBatterPitchRows call per batter
    // via a single unbounded Promise.all — a full slate's worth of
    // confirmed+projected batters easily runs 150-300+ — opened that many
    // concurrent Supabase connections at once and blew through the
    // project's connection pool (`PGRST003: Timed out acquiring connection
    // from connection pool`, dozens of them, on that same request), which
    // in turn starved every OTHER concurrent DB read in that same request
    // (gapOdds/gapOddsOpening on the same request went from their usual
    // <300ms to 15267ms/9893ms). CONCURRENCY=15 matches the same bounded
    // fan-out pattern used elsewhere (see fetchBulkBatterPitchRows in
    // matrixMatch.ts) — keeps this safe regardless of slate size. Uses
    // asyncPool (see its own comment above) instead of a batch-wait loop:
    // same hard ceiling of 15 in flight, but a straggler in one "batch"
    // no longer stalls the next 15 from starting — this mattered live:
    // even after bounding concurrency, a fully cold cache (every request
    // right after a deploy, since Next's data cache resets on deploy) still
    // produced repeated 28-56s totals dominated by this step, chunk-by-
    // chunk. Paired with getCachedBatterPitchRows' widened 24h+tag cache
    // above, this fetch should now only ever be slow the first time (or
    // shortly after a fresh deploy), not repeatedly throughout the day.
    // Real fix (2026-07-24): pitchlog_stat now has its own daily precompute
    // (see precomputedPitchlog below) for every recency EXCEPT 'custom' —
    // gated on needsPitchlogCustom instead of needsPitchlog, this live
    // per-batter fan-out should now almost never fire at all.
    timed(reqId, 'matrixPitchRows', isUltimate && needsPitchlogCustom && allDisplayedBatterIdList.length
      ? (async () => {
          const combined: Record<number, any[]> = {}
          const results = await asyncPool(15, allDisplayedBatterIdList, id =>
            getCachedBatterPitchRows(id).catch(e => { console.error('[dugout/data] matrix pitch rows failed', id, e); return {} as Record<number, any[]> })
          )
          for (const r of results) Object.assign(combined, r)
          return combined
        })()
      : Promise.resolve({} as Record<number, any[]>)),
    // Dugout grid's own Statcast section — precomputed daily by
    // /api/cron/dugout-statcast-precompute (see dugoutStatcastPrecompute.ts
    // for why: aggregating this live, per request, is what caused a real
    // production incident under concurrent load). Just a plain indexed
    // SELECT now, no live aggregation, no per-request MLB calls.
    timed(reqId, 'precomputedStatcast', isUltimate && admin ? (async () => {
      try {
        const { data } = await admin.from(DUGOUT_STATCAST_TABLE).select('mlb_id, pitcher_hand, windows').eq('game_date', date)
        return (data ?? []) as { mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<StatcastWindow, StatcastLine> }[]
      } catch (e) {
        console.error('[dugout/data] precomputed statcast fetch failed', e)
        return [] as { mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<StatcastWindow, StatcastLine> }[]
      }
    })() : Promise.resolve([] as { mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<StatcastWindow, StatcastLine> }[])),
    // Custom Matrix's pitchlog_stat category — precomputed daily by
    // /api/cron/dugout-pitchlog-stat-precompute (see
    // dugoutPitchlogStatPrecompute.ts for the incident this fixes: this
    // used to be the one Matrix category still doing a live per-batter
    // raw-pitch fetch on every request). Same shape as precomputedStatcast
    // above — plain indexed SELECT, gated the same way (only fetched when
    // some Matrix actually references this category at all).
    timed(reqId, 'precomputedPitchlog', isUltimate && admin && needsPitchlog ? (async () => {
      try {
        const { data } = await admin.from(DUGOUT_PITCHLOG_STAT_TABLE).select('mlb_id, pitcher_hand, windows').eq('game_date', date)
        return (data ?? []) as { mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<PitchlogStatWindow, BatterStats> }[]
      } catch (e) {
        console.error('[dugout/data] precomputed pitchlog stat fetch failed', e)
        return [] as { mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<PitchlogStatWindow, BatterStats> }[]
      }
    })() : Promise.resolve([] as { mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<PitchlogStatWindow, BatterStats> }[])),
    // Paper's matchup_edge/platoon_ops inputs — precomputed daily by
    // /api/cron/dugout-matchup-edge-precompute (see
    // dugoutMatchupEdgePrecompute.ts). One row per (batter|pitcher) mlb_id
    // for this date; batter rows carry platoonOps + recentByPitchTypeByHand,
    // pitcher rows carry just recentByPitchTypeByHand (allowed).
    timed(reqId, 'precomputedMatchupEdge', isUltimate && admin ? (async () => {
      try {
        const { data } = await admin.from(MATCHUP_EDGE_TABLE).select('mlb_id, role, data').eq('game_date', date)
        return (data ?? []) as { mlb_id: number; role: 'batter' | 'pitcher'; data: any }[]
      } catch (e) {
        console.error('[dugout/data] precomputed matchup edge fetch failed', e)
        return [] as { mlb_id: number; role: 'batter' | 'pitcher'; data: any }[]
      }
    })() : Promise.resolve([] as { mlb_id: number; role: 'batter' | 'pitcher'; data: any }[])),
    // MLB's schedule?hydrate=lineups CONFIRMED-lineup player objects carry
    // only id/name/position — no batSide at all. Batch-fetch real batSide
    // for every confirmed-lineup player via the people endpoint, which does
    // carry it.
    timed(reqId, 'batSideById', (async () => {
      if (!lineupBatterIdList.length) return [] as [number, string][]
      try {
        const res = await fetch(
          `https://statsapi.mlb.com/api/v1/people?personIds=${lineupBatterIdList.join(',')}`,
          { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
        )
        if (!res.ok) return []
        const people = (await res.json()).people ?? []
        return people.filter((p: any) => p.id && p.batSide?.code).map((p: any) => [p.id, p.batSide.code] as [number, string])
      } catch { return [] }
    })()),
    // Manually-imported FanDuel/BetMGM gap-market reads — explicit .range()
    // since PostgREST silently caps unpaginated selects at 1000 rows (see
    // fetchGapOdds for the full incident this fixed).
    timed(reqId, 'gapOdds', (admin && isAdvancedPlus) ? getCachedGapOdds(date) : Promise.resolve({ fdRows: [] as any[], mgmRows: [] as any[] })),
    // Opening/early baselines for the gap markets — Ultimate-only, permanent
    // first-of-the-day snapshots so the client can show open-vs-current deltas.
    timed(reqId, 'gapOddsOpening', (admin && isUltimate) ? getCachedGapOddsOpening(date) : Promise.resolve({ openingByGameKey: {} as Record<string, Record<string, Record<string, number>>> })),
    // Same silent-gap pattern as batSideById above, for the pitcher's own
    // hand — schedule's hydrate=probablePitcher never returns pitchHand.
    timed(reqId, 'pitcherHandById', (async () => {
      if (!pitcherIdList.length) return [] as [number, string][]
      try {
        const res = await fetch(
          `https://statsapi.mlb.com/api/v1/people?personIds=${pitcherIdList.join(',')}`,
          { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
        )
        if (!res.ok) return []
        const people = (await res.json()).people ?? []
        return people.filter((p: any) => p.id && p.pitchHand?.code).map((p: any) => [p.id, p.pitchHand.code] as [number, string])
      } catch { return [] }
    })()),
    timed(reqId, 'pitcherSplits', fetchPitcherSplits(pitcherIdList)),
    // Odds snapshot lookup — BDL is never called live from this route
    // anymore (see /api/cron/bdl-odds, which polls it on a fixed schedule
    // and writes here). A started-but-not-yet-frozen game gets permanently
    // frozen right here so its odds stop drifting once in-game/settled
    // markets would otherwise take over.
    timed(reqId, 'freezeSnapshots', (async () => {
      const map = new Map<string, { bdl_game_id: number | null; prop_map: BDLPropMap; is_frozen: boolean }>()
      if (!(admin && isAdvancedPlus && gamePksToday.length)) return map
      const { data: snapRows } = await admin
        .from('pregame_odds_snapshots')
        .select('game_pk, bdl_game_id, prop_map, is_frozen')
        .in('game_pk', gamePksToday)
      for (const row of snapRows ?? []) map.set(row.game_pk, row)

      const toFreeze = mlbGames
        .filter((g: any) => g.status?.abstractGameState !== 'Preview')
        .map((g: any) => String(g.gamePk))
        .filter((pk: string) => map.get(pk)?.is_frozen === false)
      if (toFreeze.length) {
        await admin
          .from('pregame_odds_snapshots')
          .update({ is_frozen: true, frozen_at: new Date().toISOString() })
          .in('game_pk', toFreeze)
      }
      return map
    })()),
  ])

  const batSideById = new Map<number, string>(batSideEntries)
  const pitcherHandById = new Map<number, string>(pitcherHandEntries)
  const snapshotByGamePk = freezeResult

  const matchupEdgeByBatter: Record<number, any> = {}
  const matchupEdgeByPitcher: Record<number, any> = {}
  for (const row of precomputedMatchupEdgeRows) {
    if (row.role === 'batter') matchupEdgeByBatter[row.mlb_id] = row.data
    else matchupEdgeByPitcher[row.mlb_id] = row.data
  }

  const precomputedStatcastByBatter: Record<number, Partial<Record<'L' | 'R', Record<StatcastWindow, StatcastLine>>>> = {}
  for (const row of precomputedStatcastRows) {
    (precomputedStatcastByBatter[row.mlb_id] ??= {})[row.pitcher_hand] = row.windows
  }

  const precomputedPitchlogByBatter: Record<number, Partial<Record<'L' | 'R', Record<PitchlogStatWindow, BatterStats>>>> = {}
  for (const row of precomputedPitchlogRows) {
    (precomputedPitchlogByBatter[row.mlb_id] ??= {})[row.pitcher_hand] = row.windows
  }

  const { hrFeed, pitcherIdByName } = hrFeedResult
  // near_hrs only ever carries the pitcher's NAME (no id column) — matched
  // against pitcherIdByName (built above from the same live games' full
  // playByPlay, not just home runs) so "Today's Near Home Runs" can show a
  // real pitcher headshot/link instead of plain text, same as the batter
  // side already gets via batter_id.
  const nearHr = (nearHrRaw ?? []).map((n: any) => ({
    ...n,
    pitcher_mlb_id: pitcherIdByName[normName(n.pitcher_name || '')] ?? null,
  }))

  // Same shape DugoutClient.tsx's own fhrAvgMap/saAvgMap build client-side
  // (see the useMemo there) — duplicated here so Custom Matrix's "Dugout
  // Specs" Factors (FHR%/HR% vs. this player's own season-average price)
  // can be evaluated server-side off data already fetched this request,
  // rather than needing the client's own derived map.
  const fhrAvgMap: Record<string, { fd?: number; cz?: number }> = {}
  for (const r of fhrAvg ?? []) {
    const nn = normName(r.name_norm || r.player_name || '')
    if (!nn) continue
    if (!fhrAvgMap[nn]) fhrAvgMap[nn] = {}
    if (r.bookmaker === 'fanduel') fhrAvgMap[nn].fd = Number(r.avg_price)
    if (r.bookmaker === 'williamhill_us') fhrAvgMap[nn].cz = Number(r.avg_price)
  }
  const saAvgMap: Record<string, { fd?: number; cz?: number }> = {}
  for (const r of saAvg ?? []) {
    const nn = normName(r.name_norm || r.player_name || '')
    if (!nn) continue
    if (!saAvgMap[nn]) saAvgMap[nn] = {}
    if (r.bookmaker === 'fanduel') saAvgMap[nn].fd = Number(r.avg_price)
    if (r.bookmaker === 'williamhill_us') saAvgMap[nn].cz = Number(r.avg_price)
  }

  // Manually-imported FanDuel markets BDL doesn't carry at all (FHR, Laser
  // 105+/110+, Moonshot, 1st PA HR, HR/ML Parlay) — see /admin/fanduel-import.
  // Scoped by game_key, NOT just name_norm: a player whose name got tagged
  // under the wrong game in an earlier paste (dropdown picked wrong that
  // time) still has a stale row sitting in the table for that other game's
  // game_key. Keying only by name_norm let that stale row nondeterministically
  // clobber the correct game's data depending on unordered row return order —
  // that's what made FHR "randomly" show as missing for real, correctly-priced
  // players. Keeping game_key as the outer key means a wrong-game row can
  // never be looked up when rendering the right game.
  const fanduelGapByGameKey: Record<string, Record<string, any>> = {}
  const mgmGapByGameKey: Record<string, Record<string, any>> = {}
  const { fdRows, mgmRows } = gapOddsResult
  for (const r of fdRows) (fanduelGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
  // Manually-imported BetMGM anytime-HR odds — backs up/fills sa.betmgm and
  // hr2.betmgm when BDL's own BetMGM coverage is sparse. See /admin/mgm-import.
  for (const r of mgmRows) (mgmGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r

  // Opening/early baselines for the gap markets — permanent first-of-the-day
  // snapshots, so the client can show open-vs-current deltas. See
  // /admin/fanduel-import and /admin/mgm-import's "opening" checkbox.
  // Ultimate-only (not just advanced+) — BatterCostClient's open-vs-current
  // delta view is a Dugout/Batter Cost-exclusive analysis, not something
  // The Public's advanced-tier access should also carry in its response.
  // gameKey -> name_norm -> `${market}:${book}` -> opening price (unified
  // across whichever pipeline/book captured it first; see
  // market_opening_prices).
  const openingByGameKey: Record<string, Record<string, Record<string, number>>> = gapOddsOpeningResult.openingByGameKey

  // 5. Build games
  const games = await Promise.all(mlbGames.map(async (g: any) => {
    const homeTeam = g.teams?.home?.team?.name || ''
    const awayTeam = g.teams?.away?.team?.name || ''
    const homeAbbr = g.teams?.home?.team?.abbreviation || homeTeam.split(' ').pop() || ''
    const awayAbbr = g.teams?.away?.team?.abbreviation || awayTeam.split(' ').pop() || ''
    const gameNum  = g.gameNumber ?? 1
    // Computed early (moved ahead of the old inline definition further down)
    // so the gap-market merge below can scope its lookups to this exact game.
    const gameKey = canonGameKey(gameNum > 1 ? `${awayAbbr}@${homeAbbr}-G${gameNum}` : `${awayAbbr}@${homeAbbr}`)
    const fanduelGapByName = fanduelGapByGameKey[gameKey] ?? {}
    const mgmGapByName = mgmGapByGameKey[gameKey] ?? {}
    const openingByName = openingByGameKey[gameKey] ?? {}

    const homePitcher = g.teams?.home?.probablePitcher
      ? { id: g.teams.home.probablePitcher.id, name: g.teams.home.probablePitcher.fullName, hand: pitcherHandById.get(g.teams.home.probablePitcher.id) ?? g.teams.home.probablePitcher.pitchHand?.code ?? 'R' }
      : null
    const awayPitcher = g.teams?.away?.probablePitcher
      ? { id: g.teams.away.probablePitcher.id, name: g.teams.away.probablePitcher.fullName, hand: pitcherHandById.get(g.teams.away.probablePitcher.id) ?? g.teams.away.probablePitcher.pitchHand?.code ?? 'R' }
      : null

    const mkLineup = (players: any[], teamAbbr: string, teamName: string) =>
      (players || []).map((p: any, i: number) => ({
        mlb_id: p.id,
        name: p.fullName || '',
        name_norm: normName(p.fullName || ''),
        batting_order: i + 1,
        position: p.primaryPosition?.abbreviation || '?',
        bats: batSideById.get(p.id) || p.batSide?.code || '?',
        team: teamAbbr,
        team_name: teamName,
        projected: false,
      }))

    let homeLineup = mkLineup(g.lineups?.homePlayers || [], homeAbbr, homeTeam)
    let awayLineup = mkLineup(g.lineups?.awayPlayers || [], awayAbbr, awayTeam)

    // Projected lineup fallback when no confirmed lineup — plain lookup
    // into the resolution getCachedDateLineupResolution already computed
    // (and cached) up top; no live fetch happens here at all.
    const homeTeamId = g.teams?.home?.team?.id
    const awayTeamId = g.teams?.away?.team?.id
    if (!homeLineup.length && homeTeamId) {
      homeLineup = projectedByTeamId[homeTeamId] ?? []
    }
    if (!awayLineup.length && awayTeamId) {
      awayLineup = projectedByTeamId[awayTeamId] ?? []
    }

    // BDL props — read straight from the snapshot the cron last wrote (see
    // step 4 above). No live BDL call on this path at all anymore.
    const snap = snapshotByGamePk.get(String(g.gamePk))
    const bdlGameId = snap?.bdl_game_id ?? null
    const propMap: BDLPropMap = snap?.prop_map ?? {}
    const bdlByName: Record<string, any> = {}
    for (const entry of Object.values(propMap)) {
      bdlByName[normName(entry.name)] = entry
    }
    // Layer in manually-imported FanDuel gap markets. Create an entry if the
    // player has no BDL props at all (e.g. a bench bat BDL doesn't price)
    // rather than silently dropping their gap-market data.
    for (const [nn, gap] of Object.entries(fanduelGapByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: gap.player_name ?? nn })
      if (gap.fhr_fd      != null) entry.fhr      = { ...entry.fhr,      fanduel: gap.fhr_fd }
      // SA/HR2-fanduel: BDL is the primary live source for these — only
      // backfill from our manual paste when BDL has nothing at all, same
      // "don't clobber a live line" rule as the BetMGM merge below.
      if (gap.sa_fd  != null && entry.sa?.fanduel  == null) entry.sa  = { ...entry.sa,  fanduel: gap.sa_fd }
      if (gap.hr2_fd != null && entry.hr2?.fanduel == null) entry.hr2 = { ...entry.hr2, fanduel: gap.hr2_fd }
      // Everything below is also BDL-live already — same opening-baseline-only rule.
      if (gap.sng_fd  != null && entry.singles?.fanduel == null) entry.singles = { ...entry.singles, fanduel: gap.sng_fd }
      if (gap.dbl_fd  != null && entry.doubles?.fanduel == null) entry.doubles = { ...entry.doubles, fanduel: gap.dbl_fd }
      if (gap.tri_fd  != null && entry.triples?.fanduel == null) entry.triples = { ...entry.triples, fanduel: gap.tri_fd }
      if (gap.rbi_fd  != null && entry.rbi?.fanduel     == null) entry.rbi     = { ...entry.rbi,     fanduel: gap.rbi_fd }
      if (gap.rbi2_fd != null && entry.rbi2?.fanduel    == null) entry.rbi2    = { ...entry.rbi2,    fanduel: gap.rbi2_fd }
      if (gap.rbi3_fd != null && entry.rbi3?.fanduel    == null) entry.rbi3    = { ...entry.rbi3,    fanduel: gap.rbi3_fd }
      if (gap.tb_fd   != null && entry.tb?.fanduel      == null) entry.tb      = { ...entry.tb,      fanduel: gap.tb_fd }
      if (gap.tb3_fd  != null && entry.tb3?.fanduel     == null) entry.tb3     = { ...entry.tb3,     fanduel: gap.tb3_fd }
      if (gap.tb4_fd  != null && entry.tb4?.fanduel     == null) entry.tb4     = { ...entry.tb4,     fanduel: gap.tb4_fd }
      if (gap.tb5_fd  != null && entry.tb5?.fanduel     == null) entry.tb5     = { ...entry.tb5,     fanduel: gap.tb5_fd }
      if (gap.hrr_fd  != null && entry.hrr?.fanduel     == null) entry.hrr     = { ...entry.hrr,     fanduel: gap.hrr_fd }
      if (gap.laser105_fd != null) entry.laser105 = { ...entry.laser105, fanduel: gap.laser105_fd }
      if (gap.laser110_fd != null) entry.laser110 = { ...entry.laser110, fanduel: gap.laser110_fd }
      if (gap.moonshot_fd != null) entry.moonshot = { ...entry.moonshot, fanduel: gap.moonshot_fd }
      if (gap.pa1_fd       != null) entry.pa1      = { ...entry.pa1,      fanduel: gap.pa1_fd }
      if (gap.hr_ml_fd     != null) entry.hrMl     = { ...entry.hrMl,     fanduel: gap.hr_ml_fd }
      // Combine-for-HR: flat fields, not vendor-nested — only FanDuel has this.
      if (gap.combo1_min != null) { entry.combo1Min = gap.combo1_min; entry.combo1Count = gap.combo1_count; entry.combo1Partners = gap.combo1_partners }
      if (gap.combo2_min != null) { entry.combo2Min = gap.combo2_min; entry.combo2Count = gap.combo2_count; entry.combo2Partners = gap.combo2_partners }
    }
    // Layer in manually-imported BetMGM HR odds — only where BDL's own live
    // betmgm coverage is missing, since a pasted snapshot is staler than a
    // live pregame line. Never overwrites a BDL value that's already there.
    for (const [nn, mgm] of Object.entries(mgmGapByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: mgm.player_name ?? nn })
      if (mgm.sa_mgm  != null && entry.sa?.betmgm  == null) entry.sa  = { ...entry.sa,  betmgm: mgm.sa_mgm }
      if (mgm.hr2_mgm != null && entry.hr2?.betmgm == null) entry.hr2 = { ...entry.hr2, betmgm: mgm.hr2_mgm }
    }
    // Opening/early baselines — attached as `.open` per market so the client
    // can show "opened X → now Y" deltas, mirroring mlb-party's b.open.fd_sa.
    // Unified across BDL + FanDuel-gap + every book each reports (whichever
    // saw a real price first); marketBookPrices is `${market}:${book}` ->
    // price, reshaped through MARKET_BOOK_TO_OPEN_FIELD into the same
    // client-facing field names the app already expects (plus the new
    // hits/hits2/runs/runs2/stolenBases/stolenBases2/saMgm/hr2Mgm fields).
    for (const [nn, marketBookPrices] of Object.entries(openingByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: nn })
      const open = { ...entry.open }
      for (const [marketBook, price] of Object.entries(marketBookPrices)) {
        const field = MARKET_BOOK_TO_OPEN_FIELD[marketBook]
        if (field) open[field] = price
      }
      entry.open = open
    }

    // Pitcher odds are a Dugout-only feature (PlayerDrillDown's oppPitcher
    // props) — advanced+ already populates bdlByName for the LINEUP's sake,
    // so this must be gated on isUltimate explicitly rather than reusing
    // that same "do we have any props data at all" check, or The Public's
    // advanced-tier response would leak pitcher odds nobody there reads but
    // an Ultimate-exclusive page charges for.
    // matchupEdge: this pitcher's own precomputed recent-per-pitch-type-
    // allowed data (see dugoutMatchupEdgePrecompute.ts) — used by the
    // OPPOSING lineup's computeMatchupEdge, same isUltimate gate as props.
    const homePitcherWithProps = homePitcher
      ? {
          ...homePitcher,
          props: isUltimate ? (resolveNameEntry(bdlByName, normName(homePitcher.name)) || null) : null,
          matchupEdge: isUltimate ? (matchupEdgeByPitcher[homePitcher.id] ?? null) : null,
        }
      : null
    const awayPitcherWithProps = awayPitcher
      ? {
          ...awayPitcher,
          props: isUltimate ? (resolveNameEntry(bdlByName, normName(awayPitcher.name)) || null) : null,
          matchupEdge: isUltimate ? (matchupEdgeByPitcher[awayPitcher.id] ?? null) : null,
        }
      : null

    // Custom Matrix's "picks % of game" Factors need each player's own
    // community pick count PLUS this exact game's total for that same
    // market, summed across all 18 real batters — built the same
    // game_key-scoped way DugoutClient.tsx's own pikkitMap is (see that
    // useMemo), not just name_norm, since an untagged legacy row could
    // otherwise bleed in from a different game. Only worth building at all
    // when this caller actually has Matrices to evaluate.
    let gameTotalPicksByMarket: Record<string, number> = {}
    const pikkitByName: Record<string, Record<string, any>> = {}
    if (userMatrices.length) {
      for (const r of pikkit ?? []) {
        if (r.game_key && r.game_key !== gameKey) continue
        const nn = normName(r.player_name || '')
        const market = r.prop_type || r.market
        if (!nn || !market) continue
        if (!pikkitByName[nn]) pikkitByName[nn] = {}
        const existing = pikkitByName[nn][market]
        if (!existing || (r.game_key && r.game_key === gameKey && !existing.game_key)) {
          pikkitByName[nn][market] = r
        }
      }
      for (const p of [...homeLineup, ...awayLineup]) {
        const entry = resolveNameEntry(pikkitByName, p.name_norm)
        if (!entry) continue
        for (const [market, row] of Object.entries(entry)) {
          const picks = (row as any)?.picks
          if (typeof picks === 'number') gameTotalPicksByMarket[market] = (gameTotalPicksByMarket[market] ?? 0) + picks
        }
      }
    }

    // The 'tied' operator (any odds field, any dugout_specs ratio): "this
    // player's value for this exact field(+book) exactly matches at least
    // one other player's" — e.g. two guys both at FHR +900, or three guys
    // all at HR÷Parlay 1.18. Per-Factor scoped via tie_scope: 'team' (the
    // default) only counts the player's own side; 'game' pools both teams.
    // A Factor can also carry an ordered tiebreaker chain (any category —
    // odds/dugout_specs/pitchlog_stat/savant_stat/picks) that narrows a raw
    // tie group down to whoever ranks best on some OTHER field, e.g. "of
    // everyone tied on HR÷Parlay, keep only the highest recent Attack
    // Angle." See groupTiedCandidates/resolveTiebreakers (matrixEngine.ts)
    // for the pure grouping/reduction logic — this block is just the data
    // plumbing: building per-player "bundles" (props + averages + the same
    // precomputed pitchlog/Savant windows the live per-player loop below
    // already reads) so any field in any category can be resolved for
    // anyone in the relevant pool, then running that logic once per 'tied'
    // Factor and caching the final winner set by factor.id (two different
    // 'tied' Factors can define different tiebreaker chains even off the
    // exact same raw field, so results can't be shared by field/book alone
    // the way the pre-tiebreaker version of this block did).
    // Each side's opposing-pitcher hand is constant across that whole
    // lineup (every home batter faces the same away pitcher, and vice
    // versa) — hoisted here so the tie/tiebreaker precompute below and both
    // per-player .map() calls further down all share one computation
    // instead of three separate inline copies.
    const homePHand = (awayPitcher?.hand as 'L' | 'R') || 'R'
    const awayPHand = (homePitcher?.hand as 'L' | 'R') || 'R'
    const tiedFactors = userMatrices.flatMap(m => m.factors.filter(f => f.operator === 'tied'))
    const factorTiedWinners = new Map<string, Set<string>>() // factor.id -> winning name_norms (whole game, scope already applied)
    if (tiedFactors.length) {
      type Bundle = {
        props: any
        fhrAvg: any
        saAvg: any
        pitchlogWindows: Record<PitchlogStatWindow, BatterStats> | null
        statcastWindows: Record<StatcastWindow, StatcastLine> | null
        pikkitEntry: any
      }
      const resolveBundle = (p: typeof homeLineup[number], pHand: 'L' | 'R'): Bundle => ({
        props: resolveNameEntry(bdlByName, p.name_norm) || null,
        fhrAvg: resolveNameEntry(fhrAvgMap, p.name_norm),
        saAvg: resolveNameEntry(saAvgMap, p.name_norm),
        pitchlogWindows: isUltimate ? (precomputedPitchlogByBatter[p.mlb_id]?.[pHand] ?? null) : null,
        statcastWindows: isUltimate ? (precomputedStatcastByBatter[p.mlb_id]?.[pHand] ?? null) : null,
        pikkitEntry: resolveNameEntry(pikkitByName, p.name_norm),
      })
      const homeBundle = new Map(homeLineup.map(p => [p.name_norm, resolveBundle(p, homePHand)]))
      const awayBundle = new Map(awayLineup.map(p => [p.name_norm, resolveBundle(p, awayPHand)]))
      const allBundle = new Map([...homeBundle, ...awayBundle])

      function resolveTiebreakerValue(name: string, tb: MatrixTiebreaker, pool: Map<string, Bundle>): number | null {
        const b = pool.get(name)
        if (!b) return null
        if (tb.category === 'odds') return computeOddsRawPrice(tb.field_key, tb.book ?? 'fanduel', b.props)
        if (tb.category === 'dugout_specs') return computeDugoutSpecsValue(tb.field_key, b.props, b.fhrAvg, b.saAvg)
        if (tb.category === 'pitchlog_stat') return computePitchlogStatValue(tb.field_key, tb.recency, b.pitchlogWindows)
        if (tb.category === 'savant_stat') return computeSavantStatValue(tb.field_key, tb.recency, b.statcastWindows)
        return computePicksValue(tb.field_key, b.pikkitEntry, gameTotalPicksByMarket)
      }
      function rootValue(f: (typeof tiedFactors)[number], book: string | null, b: Bundle): number | null {
        return f.category === 'odds' ? computeOddsRawPrice(f.field_key, book ?? 'fanduel', b.props) : computeDugoutSpecsValue(f.field_key, b.props, b.fhrAvg, b.saAvg)
      }
      // One raw field(+book), one pool (home-only/away-only/whole-game) ->
      // the final surviving winner set, after any tiebreaker chain runs.
      function winnersForPool(f: (typeof tiedFactors)[number], book: string | null, pool: Map<string, Bundle>): Set<string> {
        const values = new Map<string, number>()
        for (const [name, b] of pool) {
          const v = rootValue(f, book, b)
          if (v != null) values.set(name, v)
        }
        const groups = groupTiedCandidates(values)
        const winners = new Set<string>()
        for (const group of groups.values()) {
          const survivors = f.tiebreakers?.length
            ? resolveTiebreakers(group, f.tiebreakers, (name, tb) => resolveTiebreakerValue(name, tb, pool))
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
          // Per book, per pool -> combine per-player across books via the
          // same every/N+ semantics every other multi-book odds operator
          // already uses (see evaluateOddsFactor).
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
    }

    return {
      gamePk: g.gamePk,
      gameKey,
      gameNum,
      homeTeam, awayTeam, homeAbbr, awayAbbr,
      gameDate: g.gameDate,
      status: g.status?.abstractGameState || 'Preview',
      detailedStatus: g.status?.detailedState || '',
      // MLB reports abstractGameState as 'Final' for a postponed/cancelled
      // game (confirmed live: PIT@NYY 2026-07-21, detailedState
      // "Postponed", reason "Rain", abstractGameState still "Final") — with
      // no distinction from a genuinely completed game, so anything keying
      // off `status` alone (The Public's outcome heatmap) would grade every
      // player red/0 against a box score that was never actually played.
      // "Suspended" is deliberately excluded — a rain-suspended game's
      // already-accrued stats are real and should still grade normally.
      isVoid: /postpon|cancel/i.test(g.status?.detailedState || ''),
      venue: g.venue?.name || '',
      homePitcher: homePitcherWithProps, awayPitcher: awayPitcherWithProps,
      homeLineupConfirmed: (g.lineups?.homePlayers?.length ?? 0) > 0,
      awayLineupConfirmed: (g.lineups?.awayPlayers?.length ?? 0) > 0,
      homeScore: g.teams?.home?.score,
      awayScore: g.teams?.away?.score,
      // Real per-player box score outcomes (h/hr/2b/3b/rbi/runs/tb/sb),
      // keyed by mlb_id — empty until the game goes Live, see
      // fetchBoxscoreOutcomes above. Powers The Public's outcome heatmap.
      outcomes: outcomesByGamePk[g.gamePk] ?? {},
      bdlGameId: bdlGameId ?? null,
      _bdlDebug: {
        matchedBdlId: bdlGameId,
        hasSnapshot: !!snap,
        snapshotFrozen: snap?.is_frozen ?? null,
        propsCount: Object.keys(propMap).length,
        bdlNamesSample: Object.values(propMap).slice(0, 5).map((e: any) => e.name),
        homeLineupNamesSample: homeLineup.slice(0, 5).map(p => p.name_norm),
      },
      // Custom Matrix highlight matches — evaluated per player against the
      // OPPOSING pitcher's real hand for this specific game (home batters
      // face awayPitcher and vice versa). pitchlog_stat Factors use the bulk
      // pitch-log rows fetched once above; savant_stat Factors read the same
      // cron-precomputed Statcast row (statcastWindows) the grid's own
      // Statcast section displays — no live Savant fetch for Matrix at all.
      // Empty array (not undefined) when the caller has no Matrices, so the
      // client never has to distinguish "not Ultimate" from "Ultimate with
      // nothing saved."
      homeLineup: homeLineup.map(p => {
        const props = resolveNameEntry(bdlByName, p.name_norm) || null
        const pHand = homePHand
        const pitchRows = matrixPitchRowsByBatter[p.mlb_id] ?? []
        const statcastWindows = isUltimate ? (precomputedStatcastByBatter[p.mlb_id]?.[pHand] ?? null) : null
        const pitchlogStatWindows = isUltimate ? (precomputedPitchlogByBatter[p.mlb_id]?.[pHand] ?? null) : null
        const matrixMatches = userMatrices.length
          ? evaluateBatterMatrices(userMatrices, pHand, pitchRows, statcastWindows, props, date, {
              fhrAvg: resolveNameEntry(fhrAvgMap, p.name_norm), saAvg: resolveNameEntry(saAvgMap, p.name_norm),
              pikkitEntry: resolveNameEntry(pikkitByName, p.name_norm), gameTotalPicksByMarket,
              isFactorTied: factorId => factorTiedWinners.get(factorId)?.has(p.name_norm) ?? false,
            }, pitchlogStatWindows)
          : []
        return { ...p, props, matrixMatches, statcast: statcastWindows, matchupEdge: isUltimate ? (matchupEdgeByBatter[p.mlb_id] ?? null) : null }
      }),
      awayLineup: awayLineup.map(p => {
        const props = resolveNameEntry(bdlByName, p.name_norm) || null
        const pHand = awayPHand
        const pitchRows = matrixPitchRowsByBatter[p.mlb_id] ?? []
        const statcastWindows = isUltimate ? (precomputedStatcastByBatter[p.mlb_id]?.[pHand] ?? null) : null
        const pitchlogStatWindows = isUltimate ? (precomputedPitchlogByBatter[p.mlb_id]?.[pHand] ?? null) : null
        const matrixMatches = userMatrices.length
          ? evaluateBatterMatrices(userMatrices, pHand, pitchRows, statcastWindows, props, date, {
              fhrAvg: resolveNameEntry(fhrAvgMap, p.name_norm), saAvg: resolveNameEntry(saAvgMap, p.name_norm),
              pikkitEntry: resolveNameEntry(pikkitByName, p.name_norm), gameTotalPicksByMarket,
              isFactorTied: factorId => factorTiedWinners.get(factorId)?.has(p.name_norm) ?? false,
            }, pitchlogStatWindows)
          : []
        return { ...p, props, matrixMatches, statcast: statcastWindows, matchupEdge: isUltimate ? (matchupEdgeByBatter[p.mlb_id] ?? null) : null }
      }),
    }
  }))

  // The FanDuel gap-merge (fhr/laser/moon/etc.) re-queries fresh every
  // request and has no server-side cache of its own (revalidate=0 above),
  // but that only controls Next's OWN data cache — it doesn't stop a browser
  // or intermediate CDN from caching this GET response by URL, which is
  // identical across requests for the same date. A stale cached response
  // meant admin pastes could be sitting correctly in the DB (confirmed) but
  // never actually reach the page even after a manual refresh. Explicit
  // no-store headers close that gap.
  console.log(`[dugout/data:${reqId}] total ${Date.now() - reqStart}ms`)
  return NextResponse.json(
    { date, games, statSplits, timingSplits, pitcherSplits, pikkit, fhrAvg, saAvg, openingSaRbi, hrFeed, nearHr },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  )
}
