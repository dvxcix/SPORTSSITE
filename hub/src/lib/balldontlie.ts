const BDL_BASE = 'https://api.balldontlie.io/mlb/v1'
const BDL_KEY = '5a8ce061-7d5c-4337-b6b2-bb6c397bddcb'

const bdlHeaders = { Authorization: BDL_KEY, 'Content-Type': 'application/json' }

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BDLGame {
  id: number
  date: string
  season: number
  status: string
  home_team: { id: number; name: string; abbreviation: string }
  away_team: { id: number; name: string; abbreviation: string }
  home_team_score?: number
  away_team_score?: number
}

// Real BDL response shape — nests odds under `market`, uses a stringified
// `line_value`, and does NOT embed a `player` object (only a bare player_id).
export interface BDLPlayerProp {
  id: number
  game_id: number
  player_id: number
  prop_type: string
  vendor: string
  line_value?: string
  market: {
    type: 'over_under' | 'milestone'
    over_odds?: number
    under_odds?: number
    odds?: number
  }
  updated_at: string
}

export interface BDLPlayer {
  id: number
  first_name: string
  last_name: string
  full_name: string
  position?: string
  team?: { abbreviation: string }
}

export interface BDLSeasonStats {
  player_id: number
  player: { id: number; first_name: string; last_name: string; team?: { abbreviation: string } }
  season: number
  batting_gp?: number
  batting_ab?: number
  batting_r?: number
  batting_h?: number
  batting_avg?: number
  batting_2b?: number
  batting_3b?: number
  batting_hr?: number
  batting_rbi?: number
  batting_bb?: number
  batting_so?: number
  batting_sb?: number
  batting_obp?: number
  batting_slg?: number
  batting_ops?: number
  batting_war?: number
  batting_tb?: number
}

export interface BDLPropMap {
  // keyed by bdl player_id
  [playerId: number]: {
    name: string
    fhr?: { [vendor: string]: number }        // First HR (milestone)
    sa?: { [vendor: string]: number }         // Anytime HR / 1+ HR (line=0.5)
    hr2?: { [vendor: string]: number }        // 2+ HR (line=1.5)
    hr3?: { [vendor: string]: number }        // 3+ HR (line=2.5+)
    hits?: { [vendor: string]: number }       // 1+ hits
    rbi?: { [vendor: string]: number }        // 1+ RBI (line=0.5)
    rbi2?: { [vendor: string]: number }       // 2+ RBI (line=1.5)
    rbi3?: { [vendor: string]: number }       // 3+ RBI (line=2.5)
    tb?: { [vendor: string]: number }         // 1.5+ TB
    tb4?: { [vendor: string]: number }        // 4+ TB (line=3.5)
    tb5?: { [vendor: string]: number }        // 5+ TB (line=4.5)
    strikeouts?: { [vendor: string]: number }
    singles?: { [vendor: string]: number }
    doubles?: { [vendor: string]: number }
    triples?: { [vendor: string]: number }
    stolen_bases?: { [vendor: string]: number }
    runs?: { [vendor: string]: number }
    hrr?: { [vendor: string]: number }         // Hits+Runs+RBIs combined (line varies)
    hrr_line?: { [vendor: string]: number }
    pitcher_strikeouts?: { [vendor: string]: number }
    pitcher_strikeouts_line?: { [vendor: string]: number }
    // FanDuel-only markets BDL doesn't carry at all — filled by the admin
    // fanduel-import tool from manually-pasted console-scraper JSON.
    laser105?: { [vendor: string]: number }
    laser110?: { [vendor: string]: number }
    moonshot?: { [vendor: string]: number }
    pa1?: { [vendor: string]: number }
    hrMl?: { [vendor: string]: number }
  }
}

// ─── API calls ───────────────────────────────────────────────────────────────

// BDL's documented error codes were being silently swallowed (`!res.ok` just
// returned an empty array, indistinguishable from "genuinely no games/props
// right now") — a bad key (401) or an outage (500/503) looked identical to a
// quiet night in the logs. Logs the status distinctly per BDL's own error
// table so a systemic failure is actually visible instead of just showing up
// as thin data.
function logBDLError(endpoint: string, status: number) {
  const meaning: Record<number, string> = {
    400: 'Bad Request — request params likely malformed',
    401: 'Unauthorized — API key missing/invalid or tier lacks access to this endpoint',
    404: 'Not Found',
    406: 'Not Acceptable — requested a non-JSON format',
    429: 'Rate limited — exceeded requests/min for this tier',
    500: 'BDL internal server error',
    503: 'BDL temporarily offline for maintenance',
  }
  console.error(`[BDL] ${endpoint} → ${status}: ${meaning[status] ?? 'Unexpected status'}`)
}

export async function getBDLGames(date: string): Promise<BDLGame[]> {
  try {
    const res = await fetch(`${BDL_BASE}/games?dates[]=${date}&per_page=30`, {
      headers: bdlHeaders,
      next: { revalidate: 60 },
    })
    if (!res.ok) { logBDLError('games', res.status); return [] }
    const data = await res.json()
    return data.data ?? []
  } catch (e) {
    console.error('[BDL] games fetch threw', e)
    return []
  }
}

export async function getBDLPlayerProps(gameId: number): Promise<BDLPlayerProp[]> {
  try {
    // Live responses have not shown a `meta.next_cursor` — the endpoint appears
    // to return everything for a game in one page. Ask for the max per_page
    // and take it at face value rather than looping (looping burns rate-limit
    // budget for no benefit if there's genuinely no next page).
    const res = await fetch(`${BDL_BASE}/odds/player_props?game_id=${gameId}&per_page=100`, {
      headers: bdlHeaders,
      next: { revalidate: 120 },
    })
    if (!res.ok) { logBDLError(`odds/player_props?game_id=${gameId}`, res.status); return [] }
    const data = await res.json()
    return data.data ?? []
  } catch (e) {
    console.error(`[BDL] player_props fetch threw for game ${gameId}`, e)
    return []
  }
}

// BDL player_props responses only include a bare player_id — resolve names
// via a batch lookup. Chunked to stay well under typical per_page caps.
export async function getBDLPlayerNames(playerIds: number[]): Promise<Record<number, BDLPlayer>> {
  const uniqueIds = Array.from(new Set(playerIds)).filter(Boolean)
  if (!uniqueIds.length) return {}
  const out: Record<number, BDLPlayer> = {}
  try {
    for (let i = 0; i < uniqueIds.length; i += 100) {
      const chunk = uniqueIds.slice(i, i + 100)
      const params = new URLSearchParams({ per_page: '100' })
      chunk.forEach(id => params.append('player_ids[]', String(id)))
      const res = await fetch(`${BDL_BASE}/players?${params}`, {
        headers: bdlHeaders,
        next: { revalidate: 3600 },
      })
      if (!res.ok) { logBDLError('players', res.status); continue }
      const data = await res.json()
      for (const p of (data.data ?? []) as BDLPlayer[]) out[p.id] = p
    }
  } catch {
    // return whatever we resolved so far
  }
  return out
}

export async function getBDLSeasonStats(
  playerIds: number[],
  season: number = 2026
): Promise<BDLSeasonStats[]> {
  if (!playerIds.length) return []
  try {
    const ids = playerIds.slice(0, 100)
    const params = new URLSearchParams({ season: String(season), per_page: '100' })
    ids.forEach(id => params.append('player_ids[]', String(id)))
    const res = await fetch(`${BDL_BASE}/season_stats?${params}`, {
      headers: bdlHeaders,
      next: { revalidate: 900 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.data ?? []
  } catch {
    return []
  }
}

// Build a prop map keyed by BDL player_id from a list of raw props.
// `playerNames` resolves player_id -> full name (props responses don't embed one).
export function buildPropMap(props: BDLPlayerProp[], playerNames: Record<number, BDLPlayer> = {}): BDLPropMap {
  const map: BDLPropMap = {}
  for (const p of props) {
    const pid = p.player_id
    if (!map[pid]) {
      const known = playerNames[pid]
      const fallback = `${known?.first_name ?? ''} ${known?.last_name ?? ''}`.trim()
      map[pid] = { name: known?.full_name ?? (fallback || `Player #${pid}`) }
    }
    const entry = map[pid]
    const vendor = p.vendor
    const type = p.market?.type
    const line = p.line_value != null ? parseFloat(p.line_value) : undefined

    // Different vendors model the SAME prop differently: some post a
    // "1+ singles" line as over_under (over_odds at line 0.5), others post
    // the identical bet as a milestone (single `odds` field, no over/under
    // split). Both mean the same thing to a bettor — treat them as one
    // interchangeable value per (prop_type, vendor).
    const odds = type === 'milestone' ? p.market?.odds : p.market?.over_odds
    if (odds == null) continue

    if (p.prop_type === 'first_home_run') {
      if (!entry.fhr) entry.fhr = {}
      entry.fhr[vendor] = odds

    } else if (p.prop_type === 'home_runs' || p.prop_type === 'anytime_home_run') {
      // Vendors commonly post THREE separate home_runs lines per player —
      // 0.5 (1+ HR = "anytime"), 1.5 (2+ HR), 2.5 (3+ HR) — all tagged
      // market.type: "milestone" with no other way to tell them apart.
      // Must bucket strictly by line_value regardless of milestone/over_under,
      // or the last-processed line silently overwrites the "anytime" value.
      const l = line ?? 0.5
      if (l <= 0.5) {
        if (!entry.sa) entry.sa = {}
        entry.sa[vendor] = odds
      } else if (l <= 1.5) {
        if (!entry.hr2) entry.hr2 = {}
        entry.hr2[vendor] = odds
      } else {
        if (!entry.hr3) entry.hr3 = {}
        entry.hr3[vendor] = odds
      }

    } else if (p.prop_type === 'hits') {
      if (!entry.hits) entry.hits = {}
      entry.hits[vendor] = odds!

    } else if (p.prop_type === 'rbis') {
      const l = line ?? 0.5
      if (l <= 0.5) {
        if (!entry.rbi) entry.rbi = {}
        entry.rbi[vendor] = odds!
      } else if (l <= 1.5) {
        if (!entry.rbi2) entry.rbi2 = {}
        entry.rbi2[vendor] = odds!
      } else {
        if (!entry.rbi3) entry.rbi3 = {}
        entry.rbi3[vendor] = odds!
      }

    } else if (p.prop_type === 'total_bases') {
      const l = line ?? 1.5
      if (l <= 2.5) {
        // 1.5 or 2.5 line — standard "TB" prop
        if (!entry.tb) entry.tb = {}
        entry.tb[vendor] = odds!
      } else if (l <= 3.5) {
        // 3.5 = 4+ total bases
        if (!entry.tb4) entry.tb4 = {}
        entry.tb4[vendor] = odds!
      } else {
        // 4.5 = 5+ total bases
        if (!entry.tb5) entry.tb5 = {}
        entry.tb5[vendor] = odds!
      }

    } else if (p.prop_type === 'strikeouts') {
      if (!entry.strikeouts) entry.strikeouts = {}
      entry.strikeouts[vendor] = odds!
    } else if (p.prop_type === 'singles') {
      if (!entry.singles) entry.singles = {}
      entry.singles[vendor] = odds!
    } else if (p.prop_type === 'doubles') {
      if (!entry.doubles) entry.doubles = {}
      entry.doubles[vendor] = odds!
    } else if (p.prop_type === 'triples') {
      if (!entry.triples) entry.triples = {}
      entry.triples[vendor] = odds!
    } else if (p.prop_type === 'runs_scored') {
      if (!entry.runs) entry.runs = {}
      entry.runs[vendor] = odds!
    } else if (p.prop_type === 'stolen_bases') {
      if (!entry.stolen_bases) entry.stolen_bases = {}
      entry.stolen_bases[vendor] = odds!
    } else if (p.prop_type === 'hits_runs_rbis') {
      if (!entry.hrr) entry.hrr = {}
      entry.hrr[vendor] = odds!
      if (line != null) {
        if (!entry.hrr_line) entry.hrr_line = {}
        entry.hrr_line[vendor] = line
      }
    } else if (p.prop_type === 'pitcher_strikeouts') {
      if (!entry.pitcher_strikeouts) entry.pitcher_strikeouts = {}
      entry.pitcher_strikeouts[vendor] = odds!
      if (line != null) {
        if (!entry.pitcher_strikeouts_line) entry.pitcher_strikeouts_line = {}
        entry.pitcher_strikeouts_line[vendor] = line
      }
    }
  }
  return map
}

// Best price across vendors (lowest odds = most favorable for sportsbook = cheapest for bettor on underdog)
// For player props we want the lowest odds across books = best true price signal
export function bestOdds(vendorMap: Record<string, number> | undefined): number | null {
  if (!vendorMap) return null
  const vals = Object.values(vendorMap).filter(v => v != null)
  if (!vals.length) return null
  // For positive odds: highest = best value. For negative: closest to 0 = best.
  // "Best" for signal analysis = lowest absolute (cheapest / most likely per book)
  return vals.reduce((best, v) => {
    const bDecimal = best > 0 ? best / 100 + 1 : 100 / Math.abs(best) + 1
    const vDecimal = v > 0 ? v / 100 + 1 : 100 / Math.abs(v) + 1
    return vDecimal < bDecimal ? v : best
  })
}

export function fdOdds(vendorMap: Record<string, number> | undefined): number | null {
  return vendorMap?.['fanduel'] ?? vendorMap?.['draftkings'] ?? bestOdds(vendorMap)
}

export function oddsStr(v: number | null | undefined): string {
  if (v == null) return '—'
  return v > 0 ? `+${v}` : String(v)
}

// Implied probability from American odds
export function impliedProb(odds: number | null): number | null {
  if (odds == null) return null
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

// ─── game matching ─────────────────────────────────────────────────────────
// Shared between the BDL-odds cron (the only thing that still calls BDL
// live) and anything reading its output — moved here from dugout/data's
// route file so both have one copy instead of two drifting independently.

// `mlbGameDateIso` disambiguates when BDL returns more than one game for the
// same team pair on the queried date — this happens because BDL's dates[]
// filter appears to match on UTC calendar day, so a late-ET game from the
// PREVIOUS day (already STATUS_FINAL, stale/settled odds) can share the same
// UTC date as today's real game. Picking .find()'s first match is wrong; we
// want whichever BDL game's start time is actually closest to MLB's game.
export function matchBDLGame(bdlGames: BDLGame[], homeTeam: string, awayTeam: string, mlbGameDateIso?: string): BDLGame | null {
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

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export const toETDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
