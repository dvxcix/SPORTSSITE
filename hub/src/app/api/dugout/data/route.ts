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
  fetchUserMatrices, fetchBulkBatterPitchRows, fetchBulkSavantSplits,
  evaluateBatterMatrices,
} from '@/lib/matrixMatch'
import { computeAllStatcastWindows } from '@/lib/dugoutStatcast'

export const revalidate = 0
export const maxDuration = 60

// Every category the Dugout grid's own Statcast section needs (see
// dugoutStatcast.ts) — a strict superset of anything a member's Matrices
// could reference (savantCategoriesUsed's own 3), and Custom Matrix is
// itself Ultimate-gated, so fetching this whole set on every Ultimate
// request already covers both purposes with one bulk read.
const ALL_STATCAST_SAVANT_CATEGORIES = ['bat_tracking', 'batted_ball_splits', 'swing_path_attack_angle', 'swing_timing_miss_distance']

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

// Manually-imported gap-odds reads — the only genuinely uncached Supabase
// queries in this route (everything else here either already goes through
// mpGet's own next:{revalidate} fetch caching, or is a deliberately-live
// in-game feed). Pure reads, zero write side effects (unlike the
// pregame_odds_snapshots freeze logic below, which stays fully live since
// its correctness depends on seeing the real current is_frozen value on
// every request) — safe to share across every caller regardless of tier.
// A real admin paste can land any time, so this stays a short window
// rather than matching a cron cadence.
const getCachedGapOdds = unstable_cache(
  async (date: string) => {
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
  },
  ['dugout-gap-odds'],
  { revalidate: 60 }
)

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
const getCachedGapOddsOpening = unstable_cache(
  async (date: string) => {
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
    const openRows: { game_key: string; name_norm: string; market: string; book: string; opening_price: number }[] = []
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data } = await admin
        .from('market_opening_prices')
        .select('game_key, name_norm, market, book, opening_price')
        .eq('game_date', date)
        .range(offset, offset + PAGE - 1)
      if (!data?.length) break
      openRows.push(...data)
      if (data.length < PAGE) break
    }
    return { openRows }
  },
  ['dugout-gap-odds-opening-v3'],
  { revalidate: 60 }
)

// Custom Matrix's own bulk reads — full-season pitch-by-pitch rows and
// Savant-model splits for every batter in today's lineups. Identical for
// every Ultimate member requesting the same date (only the per-member
// Matrix EVALUATION differs, which happens after this and is cheap in-memory
// work), so this is the one place the real egress cost lives and the one
// place it needs to be shared rather than re-paid per request. Skipped
// entirely server-side (see call sites) when no signed-in member's Matrices
// actually reference that data source.
const getCachedMatrixPitchRows = unstable_cache(
  async (_date: string, batterIds: number[]) => fetchBulkBatterPitchRows(createAdminClient(), batterIds),
  ['dugout-matrix-pitchlog'],
  { revalidate: 300 }
)
const getCachedMatrixSavantSplits = unstable_cache(
  async (_date: string, mlbIds: number[], categories: string[]) => fetchBulkSavantSplits(createAdminClient(), mlbIds, categories),
  ['dugout-matrix-savant'],
  { revalidate: 300 }
)

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

// Real recency-windowed, pitch-type-specific, hand-conditioned outcomes —
// computed server-side (mlb-party's ingest-pitch-type-recency edge function)
// from raw Statcast pitch events, not Savant's pitch-arsenal-stats
// leaderboard (which silently ignores date filters and only ever returns
// season-to-date). This is what actually answers "is this batter doing
// damage lately against the exact pitch this pitcher throws, and has this
// pitcher been getting hit hard on that same pitch recently" — the real
// matchup edge, not a season-long average that flattens a slump or a streak.
// avg_launch_angle(_against) and window_start/window_end were on these
// tables already but never selected — added for the pitcher-report page's
// pitch-mix tables (launch angle column) and its "as of" date-range label,
// since `win` only ever has one value ('recent', a fixed 14-day rolling
// window) rather than the Season/L10/L5/L3/Last-start splits a real scouting
// report would want — see /pitcher-report for the honest framing of that gap.
const PITCH_RECENT_BATTER_COLS = 'mlb_id,name_norm,pitch_type,pitcher_hand,pitches,whiff_pct,gb_pct,fb_pct,ld_pct,pu_pct,hard_hit_pct,barrel_pct,home_runs,avg_exit_velo,avg_launch_angle,window_start,window_end'
const PITCH_RECENT_PITCHER_COLS = 'mlb_id,name_norm,pitch_type,bat_hand,pitches,usage_pct,whiff_pct,gb_pct,fb_pct,ld_pct,pu_pct,hard_hit_pct,barrel_pct,home_runs_allowed,avg_exit_velo_against,avg_launch_angle_against,window_start,window_end'

async function fetchBatterPitchTypeRecent() {
  return mpGetAll(`/rest/v1/batter_pitch_type_recent?select=${PITCH_RECENT_BATTER_COLS}&win=eq.recent`, 900)
}

async function fetchPitcherPitchTypeRecent() {
  return mpGetAll(`/rest/v1/pitcher_pitch_type_recent?select=${PITCH_RECENT_PITCHER_COLS}&win=eq.recent`, 900)
}

// Season platoon splits — scoped to just today's lineups since that's the
// only relevant set, not the whole league. Batter game logs and the raw
// pitch-event log that used to live alongside this (see ingest-batter-game-
// logs / ingest-pitch-type-recency) were removed once the Dugout drilldown
// migrated to real player_pitch_log data (batterStatsEngine.ts) for that —
// nothing client-side reads them anymore.
async function fetchBatterPlatoonSplits(mlbIds: number[]) {
  if (!mlbIds.length) return []
  return mpGet(`/rest/v1/batter_platoon_splits?mlb_id=in.(${mlbIds.join(',')})&select=mlb_id,name_norm,split_code,games_played,pa,ab,h,hr,rbi,bb,so,avg,obp,slg,ops`, 900)
}

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
  // If the service-role key isn't configured, degrade gracefully: skip
  // snapshot lookup entirely rather than 500ing the whole page (odds just
  // won't populate — everything else on the page still works).
  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { admin = null }

  // 1. MLB schedule
  let mlbGames: any[] = []
  try {
    mlbGames = await fetchScheduleWithRetry(date, 'lineups,probablePitcher,team,linescore,venue')
  } catch {}

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
  const userMatrices = isUltimate && admin && gate.userId ? await fetchUserMatrices(admin, gate.userId) : []

  // MLB's schedule?hydrate=lineups CONFIRMED-lineup player objects carry only
  // id/name/position — no batSide at all. Every batter was silently falling
  // back to '?' (shown as "?HB" in the UI) once lineups posted, which also
  // broke every hand-dependent computation downstream (platoon splits,
  // matchup_edge, the pitcherHand fallback chain) since those all key off
  // this same field. Only the unconfirmed/projected-lineup fallback path
  // (which hits the roster endpoint instead) ever had real hand data. Batch-
  // fetch real batSide for every confirmed-lineup player via the people
  // endpoint, which does carry it.
  const batSideById = new Map<number, string>()
  if (lineupBatterIdList.length) {
    try {
      const res = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${lineupBatterIdList.join(',')}`,
        { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
      )
      if (res.ok) {
        const people = (await res.json()).people ?? []
        for (const p of people) {
          const code = p.batSide?.code
          if (p.id && code) batSideById.set(p.id, code)
        }
      }
    } catch {}
  }

  // 2. Parallel: BDL games + all mlb-party tables
  // 2. Parallel: mlb-party tables (BDL odds no longer fetched live here —
  // see /api/cron/bdl-odds, which polls BDL on a fixed schedule and writes
  // to pregame_odds_snapshots; this route just reads that table below).
  //
  // Statcast splits/pitch-recency/pikkit are computed for every basic+
  // caller (Pitcher Report needs all of these at its own 'basic' floor).
  // Everything else here is genuinely Ultimate-exclusive analytics
  // (season averages, HR feeds, game logs, platoon/pitch-event splits) or
  // The Public's advanced-tier outcome heatmap — short-circuited to an
  // empty default rather than computed and then discarded, so a lower-tier
  // request doesn't pay for work whose result it's not entitled to anyway.
  const [statSplits, timingSplits, pikkit, fhrAvg, saAvg, openingSaRbi, hrFeedResult, nearHrRaw, batterPitchRecent, pitcherPitchRecent, batterPlatoonSplits, outcomesByGamePk, matrixPitchRowsByBatter, matrixSavantSplitsByBatter] = await Promise.all([
    fetchStatSplits(),
    fetchTimingSplits(),
    // A single mpGet() (no pagination) silently caps at the same per-request
    // row limit already worked around elsewhere in this file (see mpGetAll's
    // own comment, and the FanDuel gap-odds .range() fix) — confirmed today:
    // 1237 pikkit rows exist for one date, past that cap, and whichever rows
    // fell past it just vanished with no error. Symptom looked identical to
    // the AZ@LAD game-key bug (a real upload "not showing"), but this one
    // was a straight truncation, unrelated to which game the picks belonged
    // to — any game whose rows happened to land past the cutoff lost them.
    mpGetAll(`/rest/v1/pikkit_public_picks?game_date=eq.${date}&select=player_name,picks,prop_type,game_key`, 300),
    isUltimate ? fetchSeasonAvgDirect('batter_first_home_run', date) : Promise.resolve([]),
    isUltimate ? fetchSeasonAvgDirect('batter_home_runs', date) : Promise.resolve([]),
    isUltimate ? mpRpc('get_opening_sa_rbi', { p_date: date }) : Promise.resolve([]),
    isUltimate ? fetchHrFeed(mlbGames) : Promise.resolve({ hrFeed: [] as any[], pitcherIdByName: {} as Record<string, number> }),
    isUltimate ? mpGet(`/rest/v1/near_hrs?game_date=eq.${date}&select=batter_name,batter_id,pitcher_name,pitch_type,pitch_speed,result,inning,half_inning,exit_velocity,launch_angle,hit_distance,hit_bearing,parks_hr_count,home_team,away_team,captured_at&order=parks_hr_count.desc&limit=200`, 30) : Promise.resolve([]),
    fetchBatterPitchTypeRecent(),
    fetchPitcherPitchTypeRecent(),
    isUltimate ? fetchBatterPlatoonSplits(lineupBatterIdList) : Promise.resolve([]),
    isAdvancedPlus ? fetchBoxscoreOutcomes(mlbGames) : Promise.resolve({} as Record<number, Record<number, any>>),
    // Bulk pitch-log + Savant-split reads — power BOTH the Dugout grid's own
    // Statcast section (see dugoutStatcast.ts) and Custom Matrix's
    // pitchlog_stat/savant_stat Factors off the exact same fetch, so
    // fetching this unconditionally for every Ultimate request (rather than
    // only when a member happens to have matching Factors saved) doesn't
    // cost anything extra a Matrix-less Ultimate viewer wasn't already
    // paying for once the grid itself needs this data too.
    isUltimate && lineupBatterIdList.length ? getCachedMatrixPitchRows(date, lineupBatterIdList) : Promise.resolve({} as Record<number, any[]>),
    isUltimate && lineupBatterIdList.length ? getCachedMatrixSavantSplits(date, lineupBatterIdList, ALL_STATCAST_SAVANT_CATEGORIES) : Promise.resolve({} as Record<number, any[]>),
  ])

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
  if (admin && isAdvancedPlus) {
    // Explicit .range() — PostgREST silently caps unpaginated selects at
    // 1000 rows by default. A full slate's worth of gap-market pastes across
    // every game now regularly exceeds that (1312 rows on 2026-07-10), which
    // was truncating this result with no error and dropping whichever
    // games' rows happened to fall past row 1000 — e.g. HOU@TEX/ATL@STL
    // showing blank FHR/Laser/Moonshot/PA1/HR-ML while other games were fine.
    // Same root cause already worked around for mlb-party's batter pitch
    // events fetch above (see fetchBatterPitchEvents).
    const { fdRows, mgmRows } = await getCachedGapOdds(date)
    for (const r of fdRows) (fanduelGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
    // Manually-imported BetMGM anytime-HR odds — backs up/fills sa.betmgm and
    // hr2.betmgm when BDL's own BetMGM coverage is sparse. See /admin/mgm-import.
    for (const r of mgmRows) (mgmGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
  }

  // Opening/early baselines for the gap markets — permanent first-of-the-day
  // snapshots, so the client can show open-vs-current deltas. See
  // /admin/fanduel-import and /admin/mgm-import's "opening" checkbox.
  // Ultimate-only (not just advanced+) — BatterCostClient's open-vs-current
  // delta view is a Dugout/Batter Cost-exclusive analysis, not something
  // The Public's advanced-tier access should also carry in its response.
  // gameKey -> name_norm -> `${market}:${book}` -> opening price (unified
  // across whichever pipeline/book captured it first; see
  // market_opening_prices).
  const openingByGameKey: Record<string, Record<string, Record<string, number>>> = {}
  if (admin && isUltimate) {
    const { openRows } = await getCachedGapOddsOpening(date)
    for (const r of openRows) {
      const byName = (openingByGameKey[canonGameKey(r.game_key)] ??= {})
      ;(byName[r.name_norm] ??= {})[`${r.market}:${r.book}`] = Number(r.opening_price)
    }
  }

  // 3. Pitcher splits (needs pitcher IDs from schedule)
  const pitcherIds = new Set<number>()
  for (const g of mlbGames) {
    const hp = g.teams?.home?.probablePitcher?.id
    const ap = g.teams?.away?.probablePitcher?.id
    if (hp) pitcherIds.add(hp)
    if (ap) pitcherIds.add(ap)
  }
  const pitcherIdList = Array.from(pitcherIds)

  // Same silent-gap pattern as the confirmed-lineup batSide fix above, just
  // for the pitcher's own hand this time — confirmed live: schedule's
  // hydrate=probablePitcher NEVER returns pitchHand (every probablePitcher
  // object came back with it undefined, for every single game checked), so
  // `pitchHand?.code || 'R'` was silently forcing every pitcher on the
  // slate to "RHP" regardless of their real hand — real lefties like
  // Robert Gasser, Matthew Boyd, and Andrew Abbott all showed as RHP. This
  // fed both the page's own "RHP"/"LHP" label AND effectiveBatSide's
  // switch-hitter grouping (which pitcher hand a switch hitter should
  // count as facing), so it wasn't just cosmetic. people?personIds= does
  // carry it — batch-fetch it the same way batSide already is.
  const pitcherHandById = new Map<number, string>()
  if (pitcherIdList.length) {
    try {
      const res = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${pitcherIdList.join(',')}`,
        { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
      )
      if (res.ok) {
        const people = (await res.json()).people ?? []
        for (const p of people) {
          const code = p.pitchHand?.code
          if (p.id && code) pitcherHandById.set(p.id, code)
        }
      }
    } catch {}
  }

  const pitcherSplits = await fetchPitcherSplits(pitcherIdList)

  // 4. Odds snapshot lookup — BDL is never called live from this route
  // anymore (see /api/cron/bdl-odds, which polls it on a fixed schedule and
  // writes here). Every game just reads whatever's currently in this table,
  // started or not; a started-but-not-yet-frozen game gets permanently
  // frozen right here so its odds stop drifting once in-game/settled markets
  // would otherwise take over — same freeze-on-first-observation as before.
  // Basic-tier callers (Pitcher Report) never read a player's `.props` at
  // all, so there's nothing here for them — skipping this entirely also
  // means their request never needs the freeze side-effect below, which
  // still runs correctly off of every advanced+ request instead.
  const gamePksToday = mlbGames.map((g: any) => String(g.gamePk))
  const snapshotByGamePk = new Map<string, { bdl_game_id: number | null; prop_map: BDLPropMap; is_frozen: boolean }>()
  if (admin && isAdvancedPlus && gamePksToday.length) {
    const { data: snapRows } = await admin
      .from('pregame_odds_snapshots')
      .select('game_pk, bdl_game_id, prop_map, is_frozen')
      .in('game_pk', gamePksToday)
    for (const row of snapRows ?? []) snapshotByGamePk.set(row.game_pk, row)

    const toFreeze = mlbGames
      .filter((g: any) => g.status?.abstractGameState !== 'Preview')
      .map((g: any) => String(g.gamePk))
      .filter((pk: string) => snapshotByGamePk.get(pk)?.is_frozen === false)
    if (toFreeze.length) {
      await admin
        .from('pregame_odds_snapshots')
        .update({ is_frozen: true, frozen_at: new Date().toISOString() })
        .in('game_pk', toFreeze)
    }
  }

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

    // Projected lineup fallback when no confirmed lineup
    const homeTeamId = g.teams?.home?.team?.id
    const awayTeamId = g.teams?.away?.team?.id
    if (!homeLineup.length && homeTeamId) {
      homeLineup = await fetchProjectedLineup(homeTeamId, homeAbbr, homeTeam)
    }
    if (!awayLineup.length && awayTeamId) {
      awayLineup = await fetchProjectedLineup(awayTeamId, awayAbbr, awayTeam)
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
    const homePitcherWithProps = homePitcher
      ? { ...homePitcher, props: isUltimate ? (resolveNameEntry(bdlByName, normName(homePitcher.name)) || null) : null }
      : null
    const awayPitcherWithProps = awayPitcher
      ? { ...awayPitcher, props: isUltimate ? (resolveNameEntry(bdlByName, normName(awayPitcher.name)) || null) : null }
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
      // face awayPitcher and vice versa), using the bulk pitch-log/Savant
      // data already fetched once above. Empty array (not undefined) when
      // the caller has no Matrices, so the client never has to distinguish
      // "not Ultimate" from "Ultimate with nothing saved."
      homeLineup: homeLineup.map(p => {
        const props = resolveNameEntry(bdlByName, p.name_norm) || null
        const pHand = (awayPitcher?.hand as 'L' | 'R') || 'R'
        const pitchRows = matrixPitchRowsByBatter[p.mlb_id] ?? []
        const savantRows = matrixSavantSplitsByBatter[p.mlb_id] ?? []
        const matrixMatches = userMatrices.length
          ? evaluateBatterMatrices(userMatrices, p.bats, pHand, pitchRows, savantRows, props, date, {
              fhrAvg: resolveNameEntry(fhrAvgMap, p.name_norm), saAvg: resolveNameEntry(saAvgMap, p.name_norm),
              pikkitEntry: resolveNameEntry(pikkitByName, p.name_norm), gameTotalPicksByMarket,
            })
          : []
        const statcast = isUltimate ? computeAllStatcastWindows(pitchRows, savantRows, p.bats, pHand, date) : null
        return { ...p, props, matrixMatches, statcast }
      }),
      awayLineup: awayLineup.map(p => {
        const props = resolveNameEntry(bdlByName, p.name_norm) || null
        const pHand = (homePitcher?.hand as 'L' | 'R') || 'R'
        const pitchRows = matrixPitchRowsByBatter[p.mlb_id] ?? []
        const savantRows = matrixSavantSplitsByBatter[p.mlb_id] ?? []
        const matrixMatches = userMatrices.length
          ? evaluateBatterMatrices(userMatrices, p.bats, pHand, pitchRows, savantRows, props, date, {
              fhrAvg: resolveNameEntry(fhrAvgMap, p.name_norm), saAvg: resolveNameEntry(saAvgMap, p.name_norm),
              pikkitEntry: resolveNameEntry(pikkitByName, p.name_norm), gameTotalPicksByMarket,
            })
          : []
        const statcast = isUltimate ? computeAllStatcastWindows(pitchRows, savantRows, p.bats, pHand, date) : null
        return { ...p, props, matrixMatches, statcast }
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
  return NextResponse.json(
    { date, games, statSplits, timingSplits, pitcherSplits, pikkit, fhrAvg, saAvg, openingSaRbi, hrFeed, nearHr, batterPitchRecent, pitcherPitchRecent, batterPlatoonSplits },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  )
}
