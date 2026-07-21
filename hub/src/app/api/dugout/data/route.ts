import { NextResponse } from 'next/server'
import { type BDLPropMap } from '@/lib/balldontlie'
import { createAdminClient } from '@/lib/supabase/admin'
import { normName, resolveNameEntry } from '@/lib/nameNorm'
import { requireTier } from '@/lib/requireTier'

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
const TEAM_ABBR_ALIASES: Record<string, string> = {
  ARI: 'AZ', AZ: 'AZ',
  TBR: 'TB', TB: 'TB',
  SDP: 'SD', SD: 'SD',
  SFG: 'SF', SF: 'SF',
  KCR: 'KC', KC: 'KC',
  CHW: 'CWS', CWS: 'CWS',
  WSN: 'WSH', WSH: 'WSH',
}
const canonAbbr = (a: string) => TEAM_ABBR_ALIASES[(a || '').toUpperCase()] ?? (a || '').toUpperCase()
const canonGameKey = (key: string) => {
  const m = key.match(/^([A-Za-z]+)@([A-Za-z]+)(-G\d+)?$/)
  if (!m) return key
  return `${canonAbbr(m[1])}@${canonAbbr(m[2])}${m[3] ?? ''}`
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

// Confirmed via a live diagnostic (2026-07-21): get_fhr_history_avg and
// get_sa_history_avg both came back at EXACTLY 1000 rows despite requesting
// Range 0-4999 — the same silent per-request cap mpGetAll already works
// around for the plain-table fetches above, just never applied here since
// this hits an RPC endpoint instead. ~500 distinct players (2 bookmaker rows
// each) made it into the response; whichever players fell past whatever
// order the RPC returns rows in were silently missing from both season-
// average maps every single day — the real cause of a consistent subset of
// batters (Trea Turner, Willson Contreras, Wilyer Abreu, Vladimir Guerrero
// Jr., Jasson Dominguez, and presumably ~250 others) always rendering blank
// FHR%/HR%, unrelated to buildBatterRow's matching/formula logic.
async function mpRpc(fn: string, body: any): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    try {
      const res = await fetch(`${MP_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...mpH, Range: `${offset}-${offset + PAGE - 1}` },
        body: JSON.stringify(body),
        next: { revalidate: 3600 },
      })
      if (!res.ok) break
      const page = await res.json()
      if (!Array.isArray(page)) break
      out.push(...page)
      if (page.length < PAGE) break
    } catch { break }
  }
  return out
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

// Per-game batting logs (lets the client compute a real "last N games
// played" window, not a calendar-day one) + season platoon splits — scoped
// to just today's lineups since that's the only relevant set, not the whole
// league. See ingest-batter-game-logs.
//
// No date bound here — a full slate's lineups can easily carry a combined
// season's worth of per-game rows (confirmed live: ~67 rows/batter average),
// so this hit the exact same silent per-request truncation as
// fanduel_gap_odds and pikkit_public_picks did (mpGet caps at 1000 rows
// regardless of how many actually match). mpGetAll pages until a short
// page proves the end, same fix already applied to those two.
async function fetchBatterGameLogs(mlbIds: number[]) {
  if (!mlbIds.length) return []
  return mpGetAll(`/rest/v1/batter_game_logs?mlb_id=in.(${mlbIds.join(',')})&select=mlb_id,name_norm,game_date,pa,ab,h,hr,rbi,bb,so,avg,obp,slg,ops&order=game_date.desc`, 900)
}

async function fetchBatterPlatoonSplits(mlbIds: number[]) {
  if (!mlbIds.length) return []
  return mpGet(`/rest/v1/batter_platoon_splits?mlb_id=in.(${mlbIds.join(',')})&select=mlb_id,name_norm,split_code,games_played,pa,ab,h,hr,rbi,bb,so,avg,obp,slg,ops`, 900)
}

// The individual pitches behind batter_pitch_type_recent's aggregate
// numbers — a real batted-ball/pitch log per pitch type, not just a summary
// percentage. See ingest-pitch-type-recency (persists these instead of
// discarding them after aggregating).
async function fetchBatterPitchEvents(mlbIds: number[]) {
  if (!mlbIds.length) return []
  // A full slate's lineups can easily carry 4000-6000+ rows here (up to ~20
  // per pitch-type/hand bucket per player) — past the real per-request row
  // cap (see mpGetAll — a single big Range header does NOT bypass it,
  // confirmed against production logs; this call's old single-request
  // '0-19999' Range only ever looked safe because typical lineup sizes
  // happened to land under 1000 rows, not because it actually worked).
  return mpGetAll(`/rest/v1/batter_recent_pitch_events?mlb_id=in.(${mlbIds.join(',')})&select=mlb_id,pitch_type,pitcher_hand,seq,game_date,description,event_label,bb_type,exit_velocity,launch_angle,is_home_run&order=mlb_id.asc,seq.asc`, 900)
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

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

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
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=lineups,probablePitcher,team,linescore,venue`,
      { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
    )
    if (res.ok) mlbGames = (await res.json()).dates?.[0]?.games ?? []
  } catch {}

  const lineupBatterIds = new Set<number>()
  for (const g of mlbGames) {
    for (const p of [...(g.lineups?.homePlayers || []), ...(g.lineups?.awayPlayers || [])]) {
      if (p?.id) lineupBatterIds.add(p.id)
    }
  }
  const lineupBatterIdList = Array.from(lineupBatterIds)

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
  const [statSplits, timingSplits, pikkit, fhrAvg, saAvg, openingSaRbi, hrFeedResult, nearHrRaw, batterPitchRecent, pitcherPitchRecent, batterGameLogs, batterPlatoonSplits, batterPitchEvents] = await Promise.all([
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
    mpRpc('get_fhr_history_avg', { p_date: date }),
    mpRpc('get_sa_history_avg', { p_date: date }),
    mpRpc('get_opening_sa_rbi', { p_date: date }),
    fetchHrFeed(mlbGames),
    mpGet(`/rest/v1/near_hrs?game_date=eq.${date}&select=batter_name,batter_id,pitcher_name,pitch_type,pitch_speed,result,inning,half_inning,exit_velocity,launch_angle,hit_distance,hit_bearing,parks_hr_count,home_team,away_team,captured_at&order=parks_hr_count.desc&limit=200`, 30),
    fetchBatterPitchTypeRecent(),
    fetchPitcherPitchTypeRecent(),
    fetchBatterGameLogs(lineupBatterIdList),
    fetchBatterPlatoonSplits(lineupBatterIdList),
    fetchBatterPitchEvents(lineupBatterIdList),
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
  if (admin) {
    // Explicit .range() — PostgREST silently caps unpaginated selects at
    // 1000 rows by default. A full slate's worth of gap-market pastes across
    // every game now regularly exceeds that (1312 rows on 2026-07-10), which
    // was truncating this result with no error and dropping whichever
    // games' rows happened to fall past row 1000 — e.g. HOU@TEX/ATL@STL
    // showing blank FHR/Laser/Moonshot/PA1/HR-ML while other games were fine.
    // Same root cause already worked around for mlb-party's batter pitch
    // events fetch above (see fetchBatterPitchEvents).
    const { data: gapRows } = await admin
      .from('fanduel_gap_odds')
      .select('game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd, combo1_min, combo1_count, combo1_partners, combo2_min, combo2_count, combo2_partners')
      .eq('game_date', date)
      .range(0, 19999)
    for (const r of gapRows ?? []) (fanduelGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
  }

  // Manually-imported BetMGM anytime-HR odds — backs up/fills sa.betmgm and
  // hr2.betmgm when BDL's own BetMGM coverage is sparse. See /admin/mgm-import.
  const mgmGapByGameKey: Record<string, Record<string, any>> = {}
  if (admin) {
    const { data: mgmRows } = await admin
      .from('mgm_gap_odds')
      .select('game_key, name_norm, sa_mgm, hr2_mgm')
      .eq('game_date', date)
      .range(0, 19999)
    for (const r of mgmRows ?? []) (mgmGapByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
  }

  // Opening/early baselines for the gap markets — permanent first-of-the-day
  // snapshots, so the client can show open-vs-current deltas. See
  // /admin/fanduel-import and /admin/mgm-import's "opening" checkbox.
  const fanduelGapOpeningByGameKey: Record<string, Record<string, any>> = {}
  const mgmGapOpeningByGameKey: Record<string, Record<string, any>> = {}
  if (admin) {
    const [{ data: fdOpenRows }, { data: mgmOpenRows }] = await Promise.all([
      admin.from('fanduel_gap_odds_opening')
        .select('game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd, combo1_min, combo2_min')
        .eq('game_date', date)
        .range(0, 19999),
      admin.from('mgm_gap_odds_opening')
        .select('game_key, name_norm, sa_mgm, hr2_mgm')
        .eq('game_date', date)
        .range(0, 19999),
    ])
    for (const r of fdOpenRows ?? []) (fanduelGapOpeningByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
    for (const r of mgmOpenRows ?? []) (mgmGapOpeningByGameKey[canonGameKey(r.game_key)] ??= {})[r.name_norm] = r
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
  const gamePksToday = mlbGames.map((g: any) => String(g.gamePk))
  const snapshotByGamePk = new Map<string, { bdl_game_id: number | null; prop_map: BDLPropMap; is_frozen: boolean }>()
  if (admin && gamePksToday.length) {
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
    const fanduelGapOpeningByName = fanduelGapOpeningByGameKey[gameKey] ?? {}
    const mgmGapOpeningByName = mgmGapOpeningByGameKey[gameKey] ?? {}

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
    for (const [nn, open] of Object.entries(fanduelGapOpeningByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: nn })
      entry.open = {
        ...entry.open,
        fhr: open.fhr_fd ?? entry.open?.fhr,
        saFd: open.sa_fd ?? entry.open?.saFd,
        hr2Fd: open.hr2_fd ?? entry.open?.hr2Fd,
        sngFd: open.sng_fd ?? entry.open?.sngFd,
        dblFd: open.dbl_fd ?? entry.open?.dblFd,
        triFd: open.tri_fd ?? entry.open?.triFd,
        rbiFd: open.rbi_fd ?? entry.open?.rbiFd,
        rbi2Fd: open.rbi2_fd ?? entry.open?.rbi2Fd,
        rbi3Fd: open.rbi3_fd ?? entry.open?.rbi3Fd,
        tbFd: open.tb_fd ?? entry.open?.tbFd,
        tb3Fd: open.tb3_fd ?? entry.open?.tb3Fd,
        tb4Fd: open.tb4_fd ?? entry.open?.tb4Fd,
        tb5Fd: open.tb5_fd ?? entry.open?.tb5Fd,
        hrrFd: open.hrr_fd ?? entry.open?.hrrFd,
        laser105: open.laser105_fd ?? entry.open?.laser105,
        laser110: open.laser110_fd ?? entry.open?.laser110,
        moonshot: open.moonshot_fd ?? entry.open?.moonshot,
        pa1: open.pa1_fd ?? entry.open?.pa1,
        hrMl: open.hr_ml_fd ?? entry.open?.hrMl,
        combo1Min: open.combo1_min ?? entry.open?.combo1Min,
        combo2Min: open.combo2_min ?? entry.open?.combo2Min,
      }
    }
    for (const [nn, open] of Object.entries(mgmGapOpeningByName)) {
      const entry = resolveNameEntry(bdlByName, nn) ?? (bdlByName[nn] = { name: nn })
      entry.open = { ...entry.open, saMgm: open.sa_mgm ?? entry.open?.saMgm, hr2Mgm: open.hr2_mgm ?? entry.open?.hr2Mgm }
    }

    const homePitcherWithProps = homePitcher
      ? { ...homePitcher, props: resolveNameEntry(bdlByName, normName(homePitcher.name)) || null }
      : null
    const awayPitcherWithProps = awayPitcher
      ? { ...awayPitcher, props: resolveNameEntry(bdlByName, normName(awayPitcher.name)) || null }
      : null

    return {
      gamePk: g.gamePk,
      gameKey,
      gameNum,
      homeTeam, awayTeam, homeAbbr, awayAbbr,
      gameDate: g.gameDate,
      status: g.status?.abstractGameState || 'Preview',
      detailedStatus: g.status?.detailedState || '',
      venue: g.venue?.name || '',
      homePitcher: homePitcherWithProps, awayPitcher: awayPitcherWithProps,
      homeLineupConfirmed: (g.lineups?.homePlayers?.length ?? 0) > 0,
      awayLineupConfirmed: (g.lineups?.awayPlayers?.length ?? 0) > 0,
      homeScore: g.teams?.home?.score,
      awayScore: g.teams?.away?.score,
      bdlGameId: bdlGameId ?? null,
      _bdlDebug: {
        matchedBdlId: bdlGameId,
        hasSnapshot: !!snap,
        snapshotFrozen: snap?.is_frozen ?? null,
        propsCount: Object.keys(propMap).length,
        bdlNamesSample: Object.values(propMap).slice(0, 5).map((e: any) => e.name),
        homeLineupNamesSample: homeLineup.slice(0, 5).map(p => p.name_norm),
      },
      homeLineup: homeLineup.map(p => ({ ...p, props: resolveNameEntry(bdlByName, p.name_norm) || null })),
      awayLineup: awayLineup.map(p => ({ ...p, props: resolveNameEntry(bdlByName, p.name_norm) || null })),
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
    { date, games, statSplits, timingSplits, pitcherSplits, pikkit, fhrAvg, saAvg, openingSaRbi, hrFeed, nearHr, batterPitchRecent, pitcherPitchRecent, batterGameLogs, batterPlatoonSplits, batterPitchEvents },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  )
}
