import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { computeStatLine, lastNGameDates, type PitchLogRow } from '@slipsurge/core/batterStatsEngine'
import { isStrictlyPregameDate } from '@/lib/pregameFeatureDate'

type AdminClient = ReturnType<typeof createAdminClient>

// Precomputes the Dugout grid's "Paper" score's two remaining live inputs —
// matchup_edge (batter vs. tonight's specific pitcher, per-pitch-type) and
// platoon_ops (batter's own season OPS split vs. LHP/RHP) — from OUR OWN
// player_pitch_log, instead of mlb-party's batter_pitch_type_recent/
// pitcher_pitch_type_recent/batter_platoon_splits. Real incident
// (2026-07-24): all three of those tables turned out to be silently stuck —
// batter_pitch_type_recent/batter_platoon_splits stopped getting new rows
// entirely after 2026-07-14, and pitcher_pitch_type_recent's own daily cron
// kept "succeeding" (its fire-and-forget net.http_post dispatch never
// errors) while its actual `window_end` value stayed frozen at 2026-07-09 —
// meaning Paper's single heaviest-weighted feature (matchup_edge, 26% of
// its blend) was silently computing off a 2-week-stale recent-form window
// with zero visible sign anything was wrong. player_pitch_log already has
// every real pitch this season for both batters AND pitchers (batter_id,
// pitcher_id, pitch_type, stand, p_throws, is_swing/is_whiff/is_in_play/
// launch_speed) — everything computeMatchupEdge/platoon_ops actually need —
// so this computes both in-house, once daily, same cron-precompute pattern
// as dugoutStatcastPrecompute.ts, rather than depending on an external
// system with no visibility into whether it's still running correctly.
export const MATCHUP_EDGE_TABLE = 'dugout_matchup_edge_precomputed'

// Last 10 games actually faced against this specific hand — the same "real
// games played, not a calendar-day guess" convention already proven for the
// Statcast L10 window (see matrixEngine.ts's sliceRecencyWindow) — a more
// direct answer to "recent form vs. this hand" than mlb-party's old fixed
// 14-calendar-day window (which mixed in games vs. the OTHER hand too).
const RECENT_GAMES = 10

const MATCHUP_EDGE_SELECT = [
  'game_date', 'batter_id', 'pitcher_id', 'pitch_type', 'stand', 'p_throws',
  'events', 'is_in_play', 'is_swing', 'is_whiff', 'launch_speed',
].join(', ')

function toPitchLogRow(r: any): PitchLogRow {
  return {
    game_pk: '', game_date: r.game_date, pitcher_id: r.pitcher_id, batter_id: r.batter_id,
    pitch_type: r.pitch_type, zone: null, inning: null, balls: null, strikes: null,
    events: r.events, description: null,
    is_in_play: !!r.is_in_play, is_swing: !!r.is_swing, is_whiff: !!r.is_whiff,
    is_home_run: r.events === 'home_run',
    launch_speed: r.launch_speed != null ? Number(r.launch_speed) : null,
    launch_angle: null, xwoba: null, hit_distance: null,
    bat_speed: null, run_value: null, velocity: null, spin_rate: null,
    stand: r.stand, p_throws: r.p_throws,
    opponent_id: 0, opponent_name: '', opponent_team: null, day_night: null,
  }
}

// Same per-entity-fetch shape already proven necessary at this scale (see
// fetchBulkBatterPitchRows in matrixMatch.ts — OFFSET pagination over a
// combined IN-list blew Postgres's statement_timeout; per-id Index Scans
// don't). A single `.range(0, MAX_ROWS_PER_ID - 1)` here USED to be treated
// as "a generous per-id range guards PostgREST's own default row cap" — that
// was wrong, and it's the exact same wrong assumption that caused
// pitchLogFetch.ts's confirmed 2026-08-08 bug: this project's PostgREST caps
// ANY single request at 1000 rows no matter what `.range()` upper bound is
// requested. Confirmed live: real batters/pitchers this season have well
// over 1000 player_pitch_log rows (up to ~2300+), so a single unlooped
// range here was silently truncating matchup_edge's input data for every
// heavy-workload player — on Paper's single heaviest-weighted feature (26%
// of its blend). Paginate per id in PAGE_SIZE=1000 chunks instead, still
// batched CONCURRENCY-at-a-time across ids so this doesn't regress back
// into the OFFSET-over-combined-IN-list timeout the per-id shape itself was
// built to avoid.
async function fetchBulkRows(admin: AdminClient, ids: number[], idCol: 'batter_id' | 'pitcher_id'): Promise<Record<number, PitchLogRow[]>> {
  const byId: Record<number, PitchLogRow[]> = {}
  if (!ids.length) return byId
  const CONCURRENCY = 15
  const MAX_ROWS_PER_ID = 5000
  const PAGE_SIZE = 1000
  async function fetchOneId(id: number): Promise<any[]> {
    const rows: any[] = []
    for (let from = 0; from < MAX_ROWS_PER_ID; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from('player_pitch_log').select(MATCHUP_EDGE_SELECT).eq(idCol, id)
        .range(from, Math.min(from + PAGE_SIZE, MAX_ROWS_PER_ID) - 1)
      if (error) throw error
      if (!data?.length) break
      rows.push(...data)
      if (data.length < PAGE_SIZE) break
    }
    return rows
  }
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(chunk.map(fetchOneId))
    for (const data of results) {
      for (const r of data as any[]) {
        const key = idCol === 'batter_id' ? r.batter_id : r.pitcher_id
        ;(byId[key] ??= []).push(toPitchLogRow(r))
      }
    }
  }
  return byId
}

type PitchTypeBucket = { pitches: number; whiffPct: number | null; hardHitPct: number | null }
type RecentByHand = Partial<Record<'L' | 'R', Record<string, PitchTypeBucket>>>

// handField is 'p_throws' for a batter's own rows (recent performance vs.
// each pitcher hand) and 'stand' for a pitcher's own rows (recent
// performance allowed vs. each batter hand) — same rows, same function,
// just which side of the matchup the "hand" dimension describes.
function computeRecentByPitchTypeByHand(rows: PitchLogRow[], handField: 'p_throws' | 'stand'): RecentByHand {
  const out: RecentByHand = {}
  for (const hand of ['L', 'R'] as const) {
    const vsHand = rows.filter(r => r[handField] === hand)
    const dates = lastNGameDates(vsHand, RECENT_GAMES)
    const recent = vsHand.filter(r => dates.has(r.game_date))
    const byType = new Map<string, PitchLogRow[]>()
    for (const r of recent) {
      if (!r.pitch_type) continue
      const arr = byType.get(r.pitch_type) ?? []
      arr.push(r)
      byType.set(r.pitch_type, arr)
    }
    const buckets: Record<string, PitchTypeBucket> = {}
    for (const [pt, ptRows] of byType) {
      const line = computeStatLine(ptRows)
      buckets[pt] = { pitches: line.pitches, whiffPct: line.whiffPct, hardHitPct: line.hardHitPct }
    }
    out[hand] = buckets
  }
  return out
}

// Real season OPS split off the same events-based classification
// computeStatLine already uses everywhere else in this codebase — not a
// second, possibly-drifting implementation of AVG/OBP/SLG.
function computePlatoonOps(rows: PitchLogRow[]): { L: number | null; R: number | null } {
  const result: { L: number | null; R: number | null } = { L: null, R: null }
  for (const hand of ['L', 'R'] as const) {
    const line = computeStatLine(rows.filter(r => r.p_throws === hand))
    result[hand] = (line.obp != null && line.slg != null) ? line.obp + line.slg : null
  }
  return result
}

export async function precomputeMatchupEdgeForDate(date: string): Promise<{ date: string; batters: number; pitchers: number }> {
  const games = await getTodaysMatchups(date)
  const batterIds = new Set<number>()
  const pitcherIds = new Set<number>()
  for (const g of games) {
    for (const p of [...g.homeLineup, ...g.awayLineup]) batterIds.add(p.mlb_id)
    if (g.homePitcher?.id) pitcherIds.add(g.homePitcher.id)
    if (g.awayPitcher?.id) pitcherIds.add(g.awayPitcher.id)
  }
  const batterIdList = Array.from(batterIds)
  const pitcherIdList = Array.from(pitcherIds)
  if (!batterIdList.length && !pitcherIdList.length) return { date, batters: 0, pitchers: 0 }

  const admin = createAdminClient()
  const [batterRowsById, pitcherRowsById] = await Promise.all([
    fetchBulkRows(admin, batterIdList, 'batter_id'),
    fetchBulkRows(admin, pitcherIdList, 'pitcher_id'),
  ])

  const rows: { game_date: string; mlb_id: number; role: 'batter' | 'pitcher'; data: any }[] = []
  for (const mlbId of batterIdList) {
    // This cache is a pregame snapshot. A past-date self-heal must not let
    // that date's completed plate appearances enter its own matchup edge.
    const batRows = (batterRowsById[mlbId] ?? []).filter(row => isStrictlyPregameDate(row.game_date, date))
    rows.push({
      game_date: date, mlb_id: mlbId, role: 'batter',
      data: {
        recentByPitchTypeByHand: computeRecentByPitchTypeByHand(batRows, 'p_throws'),
        platoonOps: computePlatoonOps(batRows),
      },
    })
  }
  for (const mlbId of pitcherIdList) {
    const pitRows = (pitcherRowsById[mlbId] ?? []).filter(row => isStrictlyPregameDate(row.game_date, date))
    rows.push({
      game_date: date, mlb_id: mlbId, role: 'pitcher',
      data: { recentByPitchTypeByHand: computeRecentByPitchTypeByHand(pitRows, 'stand') },
    })
  }

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from(MATCHUP_EDGE_TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'game_date,mlb_id,role' })
    if (error) throw error
  }
  return { date, batters: batterIdList.length, pitchers: pitcherIdList.length }
}
