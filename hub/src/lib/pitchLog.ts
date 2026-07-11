// Real per-start / per-game pitch-mix computation from MLB's own free public
// Gumbo feed (statsapi.mlb.com — already used elsewhere in this app for live
// scores via getMLBGameFeed). This is an alternative to the pre-aggregated
// mlb-party `batter_pitch_type_recent`/`pitcher_pitch_type_recent` tables,
// which only ever carry a single fixed 14-day "recent" window (confirmed
// against the live DB — no season/L10/L5/L3/last-start buckets exist there).
// Fetching+parsing full game feeds live is heavier than reading a
// pre-aggregated row, so this is opt-in from the Pitcher Report page rather
// than the default data source — mitigated by long-lived caching below,
// since a Final game's play-by-play never changes once it's final.

const BASE = 'https://statsapi.mlb.com/api/v1'
const UA = { 'User-Agent': 'SlipSurge/1.0' }

async function fetchJson(url: string, revalidate: number): Promise<any> {
  try {
    const res = await fetch(url, { next: { revalidate }, headers: UA })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export interface GameRef { gamePk: number; date: string }

// Filtered to actual starts (gamesStarted > 0) — a reliever appearance in
// between starts would otherwise pollute "his last 3 starts" with relief
// innings against a different, much smaller batter sample.
export async function getPitcherStarts(mlbId: number, season: number): Promise<GameRef[]> {
  const d = await fetchJson(`${BASE}/people/${mlbId}/stats?stats=gameLog&group=pitching&season=${season}`, 3600)
  const splits = d?.stats?.[0]?.splits ?? []
  return splits
    .filter((s: any) => (s.stat?.gamesStarted ?? 0) > 0 && s.game?.gamePk)
    .map((s: any) => ({ gamePk: s.game.gamePk, date: s.date }))
}

export async function getBatterGames(mlbId: number, season: number): Promise<GameRef[]> {
  const d = await fetchJson(`${BASE}/people/${mlbId}/stats?stats=gameLog&group=hitting&season=${season}`, 3600)
  const splits = d?.stats?.[0]?.splits ?? []
  return splits
    .filter((s: any) => (s.stat?.plateAppearances ?? 0) > 0 && s.game?.gamePk)
    .map((s: any) => ({ gamePk: s.game.gamePk, date: s.date }))
}

export interface RawPitchEvent {
  gamePk: number
  pitcherId: number
  batterId: number
  pitcherHand: string
  batHand: string
  pitchType: string | null
  startSpeed: number | null
  isSwing: boolean
  isStrike: boolean
  isInPlay: boolean
  isWhiff: boolean
  isHomeRun: boolean
  launchSpeed: number | null
  launchAngle: number | null
  trajectory: string | null // MLB's own classification: ground_ball | line_drive | fly_ball | popup
}

const SWING_CALL_CODES = new Set(['S', 'F', 'T', 'X', 'E', 'D', 'M'])
// A Final game's play-by-play is immutable — cache essentially forever (30
// days) rather than re-fetching a ~1MB feed on every request for the same
// historical game.
const GAME_FEED_REVALIDATE = 60 * 60 * 24 * 30

export async function fetchGamePitchEvents(gamePk: number): Promise<RawPitchEvent[]> {
  const d = await fetchJson(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, GAME_FEED_REVALIDATE)
  const plays = d?.liveData?.plays?.allPlays ?? []
  const out: RawPitchEvent[] = []
  for (const p of plays) {
    const pitcherId = p.matchup?.pitcher?.id
    const batterId = p.matchup?.batter?.id
    if (!pitcherId || !batterId) continue
    const pitcherHand = p.matchup?.pitchHand?.code || 'R'
    const batHand = p.matchup?.batSide?.code || 'R'
    for (const ev of p.playEvents || []) {
      if (!ev.isPitch) continue
      const code = ev.details?.call?.code
      const isInPlay = !!ev.details?.isInPlay
      out.push({
        gamePk, pitcherId, batterId, pitcherHand, batHand,
        pitchType: ev.details?.type?.code || null,
        startSpeed: ev.pitchData?.startSpeed ?? null,
        isSwing: SWING_CALL_CODES.has(code),
        isStrike: !!ev.details?.isStrike,
        isInPlay,
        isWhiff: code === 'S',
        isHomeRun: isInPlay && p.result?.event === 'Home Run',
        launchSpeed: ev.hitData?.launchSpeed ?? null,
        launchAngle: ev.hitData?.launchAngle ?? null,
        trajectory: ev.hitData?.trajectory ?? null,
      })
    }
  }
  return out
}

export async function fetchManyGamePitchEvents(gamePks: number[]): Promise<RawPitchEvent[]> {
  const unique = Array.from(new Set(gamePks))
  const perGame = await Promise.all(unique.map(fetchGamePitchEvents))
  return perGame.flat()
}

// ─── aggregation — same field names/scale as the mlb-party pitch_type_recent
// tables (0-100 percentages) so the existing PitchMixTable/BatterVsPitchTable
// UI can render either source with no changes. ─────────────────────────────
const HARD_HIT_MIN_EV = 95

// Approximates MLB's proprietary Barrel classification — the exact
// seam-adjusted formula isn't public. Min 98mph EV at the 26-30° "sweet
// spot," widening linearly on both sides to the full 8-50° window by
// 116mph, per the commonly-cited public approximation of Statcast's rule.
// Directional, not official Savant barrel counts.
function isBarrel(ev: number | null, la: number | null): boolean {
  if (ev == null || la == null || ev < 98) return false
  const t = Math.min(1, (ev - 98) / (116 - 98))
  const lo = 26 - t * (26 - 8)
  const hi = 30 + t * (50 - 30)
  return la >= lo && la <= hi
}

export interface AggPitchRow {
  pitch_type: string
  pitches: number
  usage_pct: number | null
  in_play: number
  whiff_pct: number | null
  hard_hit_pct: number | null
  barrel_pct: number | null
  home_runs: number
  avg_exit_velo: number | null
  avg_launch_angle: number | null
  gb_pct: number | null
  fb_pct: number | null
  ld_pct: number | null
  pu_pct: number | null
}

// `includeUsage` scopes the usage% denominator to whatever event subset was
// passed in (e.g. just this pitcher's pitches to RHB) — matching how the
// mockup's per-hand tables each sum to ~100%, not overall pitch mix.
export function aggregateByPitchType(events: RawPitchEvent[], includeUsage: boolean): Record<string, AggPitchRow> {
  const byType = new Map<string, RawPitchEvent[]>()
  for (const e of events) {
    if (!e.pitchType) continue
    const list = byType.get(e.pitchType)
    if (list) list.push(e); else byType.set(e.pitchType, [e])
  }
  const totalTracked = events.filter(e => e.pitchType).length
  const out: Record<string, AggPitchRow> = {}
  for (const [pt, rows] of byType) {
    const swings = rows.filter(r => r.isSwing)
    const whiffs = rows.filter(r => r.isWhiff).length
    const inPlay = rows.filter(r => r.isInPlay)
    const withEv = inPlay.filter(r => r.launchSpeed != null)
    const withLa = inPlay.filter(r => r.launchAngle != null)
    const hardHit = withEv.filter(r => (r.launchSpeed as number) >= HARD_HIT_MIN_EV).length
    const barrels = inPlay.filter(r => isBarrel(r.launchSpeed, r.launchAngle)).length
    const hr = rows.filter(r => r.isHomeRun).length
    const trajCount = (t: string) => inPlay.filter(r => r.trajectory === t).length
    out[pt] = {
      pitch_type: pt,
      pitches: rows.length,
      usage_pct: includeUsage && totalTracked > 0 ? (rows.length / totalTracked) * 100 : null,
      in_play: inPlay.length,
      whiff_pct: swings.length > 0 ? (whiffs / swings.length) * 100 : null,
      hard_hit_pct: withEv.length > 0 ? (hardHit / withEv.length) * 100 : null,
      barrel_pct: inPlay.length > 0 ? (barrels / inPlay.length) * 100 : null,
      home_runs: hr,
      avg_exit_velo: withEv.length > 0 ? withEv.reduce((s, r) => s + (r.launchSpeed as number), 0) / withEv.length : null,
      avg_launch_angle: withLa.length > 0 ? withLa.reduce((s, r) => s + (r.launchAngle as number), 0) / withLa.length : null,
      gb_pct: inPlay.length > 0 ? (trajCount('ground_ball') / inPlay.length) * 100 : null,
      fb_pct: inPlay.length > 0 ? (trajCount('fly_ball') / inPlay.length) * 100 : null,
      ld_pct: inPlay.length > 0 ? (trajCount('line_drive') / inPlay.length) * 100 : null,
      pu_pct: inPlay.length > 0 ? (trajCount('popup') / inPlay.length) * 100 : null,
    }
  }
  return out
}

// Splits a pitcher's own events into vs-RHB / vs-LHB pitch-mix rows.
export function pitcherRowsByHand(events: RawPitchEvent[], pitcherId: number) {
  const own = events.filter(e => e.pitcherId === pitcherId)
  const R = own.filter(e => e.batHand === 'R')
  const L = own.filter(e => e.batHand === 'L')
  return {
    R: Object.values(aggregateByPitchType(R, true)),
    L: Object.values(aggregateByPitchType(L, true)),
  }
}

// A batter's own events, scoped to only the games in his OWN last-N-games
// set (not the pitcher's/teammates' games — a bench day means his set can
// differ from his teammates'), split by the throwing hand he faced so the
// UI can match against whichever hand the selected starter is.
export function batterRowsByPitchTypeAndHand(events: RawPitchEvent[], batterId: number, ownGamePks: Set<number>) {
  const own = events.filter(e => e.batterId === batterId && ownGamePks.has(e.gamePk))
  const byHand: Record<'R' | 'L', Record<string, AggPitchRow>> = {
    R: aggregateByPitchType(own.filter(e => e.pitcherHand === 'R'), false),
    L: aggregateByPitchType(own.filter(e => e.pitcherHand === 'L'), false),
  }
  const byPitchType: Record<string, { R?: AggPitchRow; L?: AggPitchRow }> = {}
  for (const hand of ['R', 'L'] as const) {
    for (const [pt, row] of Object.entries(byHand[hand])) {
      ;(byPitchType[pt] ??= {})[hand] = row
    }
  }
  return byPitchType
}
