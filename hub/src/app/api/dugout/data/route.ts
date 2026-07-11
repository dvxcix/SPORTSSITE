import { NextResponse } from 'next/server'
import { getBDLGames, getBDLPlayerProps, getBDLPlayerNames, buildPropMap, type BDLGame, type BDLPropMap, type BDLPlayerProp } from '@/lib/balldontlie'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0
export const maxDuration = 60

const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ').trim()

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
async function fetchBatterGameLogs(mlbIds: number[]) {
  if (!mlbIds.length) return []
  return mpGet(`/rest/v1/batter_game_logs?mlb_id=in.(${mlbIds.join(',')})&select=mlb_id,name_norm,game_date,pa,ab,h,hr,rbi,bb,so,avg,obp,slg,ops&order=game_date.desc`, 900)
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
async function fetchHrFeed(mlbGames: any[]): Promise<any[]> {
  const livePks = mlbGames
    .filter((g: any) => { const s = g.status?.abstractGameState; return s === 'Live' || s === 'Final' })
    .map((g: any) => g.gamePk)
    .filter(Boolean)
  if (!livePks.length) return []

  const results = await Promise.all(livePks.map(async (pk: number) => {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/game/${pk}/playByPlay`, { cache: 'no-store' })
      if (!r.ok) return []
      const d = await r.json()
      const plays: any[] = d.allPlays || []
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
  return hrFeed
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
    return roster
      .filter(p => p.position?.type !== 'Pitcher')
      .sort((a, b) => (POS_ORDER[a.position?.abbreviation] ?? 9) - (POS_ORDER[b.position?.abbreviation] ?? 9))
      .map((p, i) => ({
        mlb_id: p.person.id,
        name: p.person.fullName || '',
        name_norm: normName(p.person.fullName || ''),
        batting_order: i + 1,
        position: p.position?.abbreviation || '?',
        bats: p.person.batSide?.code || '?',
        team: teamAbbr,
        team_name: teamName,
        projected: true,
      }))
  } catch { return [] }
}

// `mlbGameDateIso` disambiguates when BDL returns more than one game for the
// same team pair on the queried date — this happens because BDL's dates[]
// filter appears to match on UTC calendar day, so a late-ET game from the
// PREVIOUS day (already STATUS_FINAL, stale/settled odds) can share the same
// UTC date as today's real game. Picking .find()'s first match is wrong; we
// want whichever BDL game's start time is actually closest to MLB's game.
function matchBDLGame(bdlGames: BDLGame[], homeTeam: string, awayTeam: string, mlbGameDateIso?: string): BDLGame | null {
  const last = (s: string) => s.split(' ').pop()!.toLowerCase()
  const ha = last(homeTeam), aa = last(awayTeam)
  const candidates = bdlGames.filter(g => {
    const bha = g.home_team.abbreviation.toLowerCase()
    const baa = g.away_team.abbreviation.toLowerCase()
    const bhn = g.home_team.name.toLowerCase()
    const ban = g.away_team.name.toLowerCase()
    return (bha === ha || bhn.includes(ha) || homeTeam.toLowerCase().includes(last(g.home_team.name))) &&
           (baa === aa || ban.includes(aa) || awayTeam.toLowerCase().includes(last(g.away_team.name)))
  })
  if (!candidates.length) return null
  if (candidates.length === 1 || !mlbGameDateIso) return candidates[0]

  const target = new Date(mlbGameDateIso).getTime()
  return candidates.reduce((best, g) => {
    const diff = Math.abs(new Date(g.date).getTime() - target)
    const bestDiff = Math.abs(new Date(best.date).getTime() - target)
    return diff < bestDiff ? g : best
  })
}

// Track which BDL games have been claimed to avoid double-header collisions
const claimedBdlIds = new Set<number>()

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

const toETDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const isPastDate = date < todayET
  // If the service-role key isn't configured, degrade gracefully: skip
  // snapshot persistence/lookup entirely rather than 500ing the whole page.
  // Live (pregame) odds still work fine without it.
  let admin: ReturnType<typeof createAdminClient> | null = null
  try { admin = createAdminClient() } catch { admin = null }

  claimedBdlIds.clear()

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
  // BDL's dates[] filter matches the UTC calendar day, not ET. A late-ET
  // game from the PREVIOUS day (e.g. 9:45pm ET start = 01:45 UTC next day)
  // lands on today's UTC date and leaks into results as an already-finished,
  // stale-odds duplicate of today's real matchup. Conversely a late West
  // coast start tonight can roll into tomorrow's UTC date and get missed
  // entirely. Fetch both the target date and the next UTC day, then filter
  // to games whose ACTUAL ET calendar date matches what was requested.
  const [bdlGamesDay1, bdlGamesDay2, statSplits, timingSplits, pikkit, fhrAvg, saAvg, openingSaRbi, hrFeed, nearHr, batterPitchRecent, pitcherPitchRecent, batterGameLogs, batterPlatoonSplits, batterPitchEvents] = await Promise.all([
    getBDLGames(date),
    getBDLGames(addDaysToDateStr(date, 1)),
    fetchStatSplits(),
    fetchTimingSplits(),
    mpGet(`/rest/v1/pikkit_public_picks?game_date=eq.${date}&select=player_name,picks,prop_type`, 300),
    mpRpc('get_fhr_history_avg', { p_date: date }),
    mpRpc('get_sa_history_avg', { p_date: date }),
    mpRpc('get_opening_sa_rbi', { p_date: date }),
    fetchHrFeed(mlbGames),
    mpGet(`/rest/v1/near_hrs?game_date=eq.${date}&select=batter_name,batter_id,pitcher_name,pitch_type,pitch_speed,result,inning,half_inning,exit_velocity,launch_angle,hit_distance,hit_bearing,parks_hr_count,home_team,away_team&order=parks_hr_count.desc&limit=200`, 30),
    fetchBatterPitchTypeRecent(),
    fetchPitcherPitchTypeRecent(),
    fetchBatterGameLogs(lineupBatterIdList),
    fetchBatterPlatoonSplits(lineupBatterIdList),
    fetchBatterPitchEvents(lineupBatterIdList),
  ])

  // TEMP DEBUG — verifying the real mpGetAll pagination loop actually pulls
  // full row counts in production (statSplits should be ~2148, timingSplits
  // ~10691, batterPitchRecent ~6331, pitcherPitchRecent ~3942 — none of
  // these should land on a suspiciously round multiple of 1000 anymore).
  // Remove after confirming in runtime logs.
  console.log('[pagination-fix-check]', JSON.stringify({
    statSplits: statSplits.length,
    timingSplits: timingSplits.length,
    batterPitchRecent: batterPitchRecent.length,
    pitcherPitchRecent: pitcherPitchRecent.length,
    batterPitchEvents: batterPitchEvents.length,
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
      .select('game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd, combo1_min, combo1_count, combo1_partners, combo2_min, combo2_count, combo2_partners')
      .eq('game_date', date)
      .range(0, 19999)
    for (const r of gapRows ?? []) (fanduelGapByGameKey[r.game_key] ??= {})[r.name_norm] = r
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
    for (const r of mgmRows ?? []) (mgmGapByGameKey[r.game_key] ??= {})[r.name_norm] = r
  }

  // Opening/early baselines for the gap markets — permanent first-of-the-day
  // snapshots, so the client can show open-vs-current deltas. See
  // /admin/fanduel-import and /admin/mgm-import's "opening" checkbox.
  const fanduelGapOpeningByGameKey: Record<string, Record<string, any>> = {}
  const mgmGapOpeningByGameKey: Record<string, Record<string, any>> = {}
  if (admin) {
    const [{ data: fdOpenRows }, { data: mgmOpenRows }] = await Promise.all([
      admin.from('fanduel_gap_odds_opening')
        .select('game_key, name_norm, fhr_fd, sa_fd, hr2_fd, sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb4_fd, tb5_fd, hrr_fd, laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hr_ml_fd, combo1_min, combo2_min')
        .eq('game_date', date)
        .range(0, 19999),
      admin.from('mgm_gap_odds_opening')
        .select('game_key, name_norm, sa_mgm, hr2_mgm')
        .eq('game_date', date)
        .range(0, 19999),
    ])
    for (const r of fdOpenRows ?? []) (fanduelGapOpeningByGameKey[r.game_key] ??= {})[r.name_norm] = r
    for (const r of mgmOpenRows ?? []) (mgmGapOpeningByGameKey[r.game_key] ??= {})[r.name_norm] = r
  }

  const bdlGamesById = new Map<number, BDLGame>()
  for (const g of [...bdlGamesDay1, ...bdlGamesDay2]) bdlGamesById.set(g.id, g)
  const bdlGames = Array.from(bdlGamesById.values()).filter(g => toETDate(g.date) === date)

  // 3. Pitcher splits (needs pitcher IDs from schedule)
  const pitcherIds = new Set<number>()
  for (const g of mlbGames) {
    const hp = g.teams?.home?.probablePitcher?.id
    const ap = g.teams?.away?.probablePitcher?.id
    if (hp) pitcherIds.add(hp)
    if (ap) pitcherIds.add(ap)
  }
  const pitcherSplits = await fetchPitcherSplits(Array.from(pitcherIds))

  // 4. Match each MLB game to a BDL game and fetch its props — sequential,
  // in mlbGames order. This must NOT run inside the parallel games.map below:
  // doing so races multiple async branches against the shared claimedBdlIds
  // set, so a doubleheader's game 2 could nondeterministically claim game 1's
  // (already-finished, odds-stale) BDL id depending on which promise resolves
  // its earlier awaits first. Sequential also keeps us under BDL's tight
  // per-minute rate limit instead of firing N parallel prop requests at once.
  //
  // Once a game has started (or we're viewing a past date), live odds are no
  // longer meaningful for pregame research — skip BDL entirely for those and
  // serve the frozen pregame snapshot captured right up until first pitch.
  const bdlPropsByGameIndex: BDLPlayerProp[][] = []
  const bdlGameIdByGameIndex: (number | null)[] = []
  const useSnapshotByIndex: boolean[] = []
  for (const g of mlbGames) {
    const hasStarted = g.status?.abstractGameState !== 'Preview'
    const useSnapshot = isPastDate || hasStarted
    useSnapshotByIndex.push(useSnapshot)
    if (useSnapshot) {
      bdlGameIdByGameIndex.push(null)
      bdlPropsByGameIndex.push([])
      continue
    }
    const homeTeam = g.teams?.home?.team?.name || ''
    const awayTeam = g.teams?.away?.team?.name || ''
    const bdlGame = matchBDLGame(bdlGames.filter(bg => !claimedBdlIds.has(bg.id)), homeTeam, awayTeam, g.gameDate)
    if (bdlGame) {
      claimedBdlIds.add(bdlGame.id)
      bdlGameIdByGameIndex.push(bdlGame.id)
      bdlPropsByGameIndex.push(await getBDLPlayerProps(bdlGame.id))
    } else {
      bdlGameIdByGameIndex.push(null)
      bdlPropsByGameIndex.push([])
    }
  }
  const allPlayerIds = bdlPropsByGameIndex.flat().map(p => p.player_id)
  const bdlPlayerNames = await getBDLPlayerNames(allPlayerIds)

  // Load any existing pregame snapshots for games that have started/passed,
  // and freeze (lock in permanently) whichever snapshot was last captured
  // before we first noticed the game had started.
  const gamePksNeedingSnapshot = mlbGames
    .filter((_: any, i: number) => useSnapshotByIndex[i])
    .map((g: any) => String(g.gamePk))
  const snapshotByGamePk = new Map<string, { prop_map: BDLPropMap; is_frozen: boolean }>()
  if (admin && gamePksNeedingSnapshot.length) {
    const { data: snapRows } = await admin
      .from('pregame_odds_snapshots')
      .select('game_pk, prop_map, is_frozen')
      .in('game_pk', gamePksNeedingSnapshot)
    for (const row of snapRows ?? []) snapshotByGamePk.set(row.game_pk, row)

    const toFreeze = (snapRows ?? []).filter(r => !r.is_frozen).map(r => r.game_pk)
    if (toFreeze.length) {
      await admin
        .from('pregame_odds_snapshots')
        .update({ is_frozen: true, frozen_at: new Date().toISOString() })
        .in('game_pk', toFreeze)
    }
  }

  // 5. Build games
  const snapshotUpserts: any[] = []
  const games = await Promise.all(mlbGames.map(async (g: any, gi: number) => {
    const homeTeam = g.teams?.home?.team?.name || ''
    const awayTeam = g.teams?.away?.team?.name || ''
    const homeAbbr = g.teams?.home?.team?.abbreviation || homeTeam.split(' ').pop() || ''
    const awayAbbr = g.teams?.away?.team?.abbreviation || awayTeam.split(' ').pop() || ''
    const gameNum  = g.gameNumber ?? 1
    // Computed early (moved ahead of the old inline definition further down)
    // so the gap-market merge below can scope its lookups to this exact game.
    const gameKey = gameNum > 1 ? `${awayAbbr}@${homeAbbr}-G${gameNum}` : `${awayAbbr}@${homeAbbr}`
    const fanduelGapByName = fanduelGapByGameKey[gameKey] ?? {}
    const mgmGapByName = mgmGapByGameKey[gameKey] ?? {}
    const fanduelGapOpeningByName = fanduelGapOpeningByGameKey[gameKey] ?? {}
    const mgmGapOpeningByName = mgmGapOpeningByGameKey[gameKey] ?? {}

    const homePitcher = g.teams?.home?.probablePitcher
      ? { id: g.teams.home.probablePitcher.id, name: g.teams.home.probablePitcher.fullName, hand: g.teams.home.probablePitcher.pitchHand?.code || 'R' }
      : null
    const awayPitcher = g.teams?.away?.probablePitcher
      ? { id: g.teams.away.probablePitcher.id, name: g.teams.away.probablePitcher.fullName, hand: g.teams.away.probablePitcher.pitchHand?.code || 'R' }
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

    // BDL props — matched sequentially above (see step 4) to avoid the
    // doubleheader race and respect the BDL rate limit. Once a game has
    // started (or we're viewing history), serve the frozen pregame snapshot
    // instead of live odds — in-game/post-game markets don't belong on a
    // pregame research board.
    const bdlGameId = bdlGameIdByGameIndex[gi]
    let propMap: BDLPropMap
    if (useSnapshotByIndex[gi]) {
      propMap = snapshotByGamePk.get(String(g.gamePk))?.prop_map ?? {}
    } else {
      propMap = bdlGameId != null ? buildPropMap(bdlPropsByGameIndex[gi], bdlPlayerNames) : {}
      if (bdlGameId != null) {
        snapshotUpserts.push({
          game_pk: String(g.gamePk),
          game_date: date,
          bdl_game_id: bdlGameId,
          home_abbr: homeAbbr,
          away_abbr: awayAbbr,
          prop_map: propMap,
          is_frozen: false,
          captured_at: new Date().toISOString(),
        })
      }
    }
    const bdlByName: Record<string, any> = {}
    for (const entry of Object.values(propMap)) {
      bdlByName[normName(entry.name)] = entry
    }
    // Layer in manually-imported FanDuel gap markets. Create an entry if the
    // player has no BDL props at all (e.g. a bench bat BDL doesn't price)
    // rather than silently dropping their gap-market data.
    for (const [nn, gap] of Object.entries(fanduelGapByName)) {
      const entry = (bdlByName[nn] ??= { name: gap.player_name ?? nn })
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
      const entry = (bdlByName[nn] ??= { name: mgm.player_name ?? nn })
      if (mgm.sa_mgm  != null && entry.sa?.betmgm  == null) entry.sa  = { ...entry.sa,  betmgm: mgm.sa_mgm }
      if (mgm.hr2_mgm != null && entry.hr2?.betmgm == null) entry.hr2 = { ...entry.hr2, betmgm: mgm.hr2_mgm }
    }
    // Opening/early baselines — attached as `.open` per market so the client
    // can show "opened X → now Y" deltas, mirroring mlb-party's b.open.fd_sa.
    for (const [nn, open] of Object.entries(fanduelGapOpeningByName)) {
      const entry = (bdlByName[nn] ??= { name: nn })
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
      const entry = (bdlByName[nn] ??= { name: nn })
      entry.open = { ...entry.open, saMgm: open.sa_mgm ?? entry.open?.saMgm, hr2Mgm: open.hr2_mgm ?? entry.open?.hr2Mgm }
    }

    const homePitcherWithProps = homePitcher
      ? { ...homePitcher, props: bdlByName[normName(homePitcher.name)] || null }
      : null
    const awayPitcherWithProps = awayPitcher
      ? { ...awayPitcher, props: bdlByName[normName(awayPitcher.name)] || null }
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
        bdlGamesTotal: bdlGames.length,
        matchedBdlId: bdlGameId ?? null,
        usedSnapshot: useSnapshotByIndex[gi],
        snapshotFrozen: snapshotByGamePk.get(String(g.gamePk))?.is_frozen ?? null,
        rawPropsCount: bdlPropsByGameIndex[gi]?.length ?? 0,
        propsCount: Object.keys(propMap).length,
        bdlNamesSample: Object.values(propMap).slice(0, 5).map(e => e.name),
        homeLineupNamesSample: homeLineup.slice(0, 5).map(p => p.name_norm),
      },
      homeLineup: homeLineup.map(p => ({ ...p, props: bdlByName[p.name_norm] || null })),
      awayLineup: awayLineup.map(p => ({ ...p, props: bdlByName[p.name_norm] || null })),
    }
  }))

  if (admin && snapshotUpserts.length) {
    await admin.from('pregame_odds_snapshots').upsert(snapshotUpserts, { onConflict: 'game_pk' })
  }

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
