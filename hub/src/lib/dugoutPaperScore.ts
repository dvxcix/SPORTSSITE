// "Paper" composite score + the MM (sportsbook-rank vs. Statcast-rank) diff
// derived from it — extracted from DugoutClient.tsx so the exact same code
// drives both the live board's own columns AND the server-side Matrix
// engine's new 'mm' dugout_specs field (see matrixEngine.ts). Kept as pure
// functions over minimal row shapes (not the full client-side BatterRow)
// so both call sites can share one implementation with zero drift risk —
// the whole reason a Matrix "MM" filter must always agree with what a
// member sees in the live column it's named after.
import type { MmByWindow } from '@/lib/matrixEngine'

export type PitcherSplitRow = {
  mlb_id?: string | number | null
  bat_hand?: string | null
  win?: string | null
  pct_fastball?: number | null; pct_sinker?: number | null; pct_cutter?: number | null
  pct_slider?: number | null; pct_curveball?: number | null; pct_changeup?: number | null; pct_splitter?: number | null
}
export type PitcherMap = Record<string, Record<string, { season?: PitcherSplitRow; recent?: PitcherSplitRow }>>

// Ingestion writes one row per (mlb_id, bat_hand, win) — pitch-mix against
// lefties vs. righties is genuinely different, not just a formality. Keyed
// by hand first (falling back to 'R' then whatever's there) so a real
// dimension never silently gets collapsed away by a same-id upsert order.
export function buildPitcherMap(rows: PitcherSplitRow[]): PitcherMap {
  const map: PitcherMap = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    if (!id) continue
    const hand = r.bat_hand || 'R'
    const win = r.win || 'season'
    if (!map[id]) map[id] = {}
    if (!map[id][hand]) map[id][hand] = {}
    ;(map[id][hand] as any)[win] = r
  }
  return map
}

export function pickPitcherRow(pitcherMap: PitcherMap, pitcherId: string | number | null | undefined, batterHand: string | null | undefined): PitcherSplitRow | null {
  if (!pitcherId) return null
  const byHand = pitcherMap[String(pitcherId)]
  if (!byHand) return null
  const hand = (batterHand || 'R') as string
  const row = byHand[hand] ?? byHand['R'] ?? Object.values(byHand)[0]
  return row ? (row.season ?? row.recent ?? null) : null
}

export type MatchupEdgeData = {
  recentByPitchTypeByHand?: Partial<Record<'L' | 'R', Record<string, { pitches: number; whiffPct: number | null; hardHitPct: number | null }>>>
  platoonOps?: { L: number | null; R: number | null }
} | null | undefined

// The actual "will this guy go deep TONIGHT" signal — usage-weighted across
// every pitch this specific pitcher throws: is the batter recently hitting
// that exact pitch hard (high hard-hit%, low whiff%), AND has the pitcher
// recently been getting hit hard on that same pitch too. Requires real
// recent sample on both sides (≥8 pitches) per pitch type, else that pitch
// type is skipped rather than guessed at. batterMatchupData/pitcherMatchupData
// come straight off dugout_matchup_edge_precomputed (dugoutMatchupEdgePrecompute.ts).
export function computeMatchupEdgeScore(
  pitcherHand: string, batterHand: string, pitRow: PitcherSplitRow | null,
  batterMatchupData: MatchupEdgeData, pitcherMatchupData: MatchupEdgeData,
): number | null {
  if (!pitRow) return null
  const mix = ([
    ['FF', pitRow.pct_fastball  || 0], ['SI', pitRow.pct_sinker   || 0], ['FC', pitRow.pct_cutter || 0],
    ['SL', pitRow.pct_slider    || 0], ['CU', pitRow.pct_curveball || 0], ['CH', pitRow.pct_changeup || 0],
    ['FS', pitRow.pct_splitter  || 0],
  ] as [string, number][]).filter(([, p]) => p > 4)
  if (!mix.length) return null
  const batterByHand = batterMatchupData?.recentByPitchTypeByHand?.[pitcherHand as 'L' | 'R']
  const pitcherByHand = pitcherMatchupData?.recentByPitchTypeByHand?.[(batterHand || 'R') as 'L' | 'R']
  let sum = 0, wsum = 0
  for (const [pt, usage] of mix) {
    const batEdge = batterByHand?.[pt]
    const pitEdge = pitcherByHand?.[pt]
    if (!batEdge || !pitEdge || batEdge.pitches < 8 || pitEdge.pitches < 8) continue
    const batScore = (batEdge.hardHitPct ?? 30) - (batEdge.whiffPct ?? 25)
    const pitScore = (pitEdge.hardHitPct ?? 30) - (pitEdge.whiffPct ?? 20)
    const sampleConf = Math.min(1, Math.min(batEdge.pitches, pitEdge.pitches) / 20)
    const w = usage * sampleConf
    sum += w * (batScore + pitScore)
    wsum += w
  }
  return wsum > 0 ? sum / wsum : null
}

export type PaperInputRow = {
  matchup_edge: number | null
  s_brl: number | null
  s_spd: number | null; r_spd: number | null
  platoon_ops: number | null
  s_pa: number | null
  s_sq: number | null; r_sq: number | null
  s_hh: number | null
  s_ev: number | null
  s_timing: number | null; r_timing: number | null
  recent_pitch_count: number | null
  paper?: number | null
}

// matchup_edge carries the heaviest weight on purpose: it's the only
// feature here that actually looks at TONIGHT's specific pitcher (recent
// pitch-type-level results on both sides), everything else is the batter's
// own generic season/recent form in a vacuum.
export function computePaperScores<T extends PaperInputRow>(rows: T[]): void {
  const feats: Array<{ s: keyof PaperInputRow; r: keyof PaperInputRow | null; w: number }> = [
    { s: 'matchup_edge', r: null,       w: 0.26 },
    { s: 's_brl',        r: null,       w: 0.20 },
    { s: 's_spd',        r: 'r_spd',    w: 0.15 },
    { s: 'platoon_ops',  r: null,       w: 0.12 },
    { s: 's_pa',         r: null,       w: 0.12 },
    { s: 's_sq',         r: 'r_sq',     w: 0.08 },
    { s: 's_hh',         r: null,       w: 0.04 },
    { s: 's_ev',         r: null,       w: 0.02 },
    { s: 's_timing',     r: 'r_timing', w: 0.01 },
  ]
  const blend = (row: PaperInputRow, f: typeof feats[0]): number | null => {
    const sv = row[f.s] as number | null
    const rv = f.r ? row[f.r] as number | null : null
    if (rv != null && sv != null) return 0.7 * rv + 0.3 * sv
    return rv ?? sv ?? null
  }
  const stats: Record<string, { m: number; sd: number }> = {}
  for (const f of feats) {
    const vals = rows.map(r => blend(r, f)).filter((x): x is number => x != null)
    const m  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) : 1
    stats[String(f.s)] = { m, sd: sd || 1 }
  }
  for (const r of rows) {
    let p = 0, tw = 0
    for (const f of feats) {
      const v = blend(r, f)
      const { m, sd } = stats[String(f.s)]
      if (v != null && sd > 0) {
        const z = (v - m) / sd
        p  += f.w * z
        tw += f.w
      }
    }
    const raw = tw > 0 ? p / tw : null
    // Confidence dampening: a bench bat with a handful of recent pitches can
    // post a wild season rate stat that z-scores identically to an everyday
    // player's stable one — the z-score math has no idea one is noise and
    // the other is signal. 40 recent pitches ≈ full confidence.
    const confidence = Math.min(1, (r.recent_pitch_count ?? 0) / 40)
    r.paper = raw != null ? Math.round(raw * confidence * 1000) / 1000 : null
  }
}

export type RankInputRow = PaperInputRow & {
  sa_fd: number | null
  bk_rk?: number | null; pp_rk?: number | null; mm?: number | null
}

// bk_rk/pp_rk/mm are rank-against-THIS-POOL numbers — `rows` must already
// be the full comparison pool (the live board ranks across the WHOLE
// game, both lineups combined, not per-team) and must already have `.paper`
// set via computePaperScores above.
export function computeMmRanks<T extends RankInputRow>(rows: T[]): void {
  const bk = [...rows].filter(r => r.sa_fd != null)
    .sort((a, b) => (toImplProb(b.sa_fd) ?? 0) - (toImplProb(a.sa_fd) ?? 0))
  bk.forEach((r, i) => { r.bk_rk = i + 1 })

  const pp = [...rows].filter(r => r.paper != null)
    .sort((a, b) => (b.paper ?? 0) - (a.paper ?? 0))
  pp.forEach((r, i) => { r.pp_rk = i + 1 })

  for (const r of rows) {
    if (r.bk_rk != null && r.pp_rk != null) r.mm = r.bk_rk - r.pp_rk
    else r.mm = undefined
  }
}

function toImplProb(o: number | null): number | null {
  if (o == null) return null
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100)
}

// One player's raw ingredients for the whole-game MM precompute below —
// everything dugout/data/route.ts already has in scope per player once
// isUltimate-gated data is fetched (bdlByName props, precomputed Statcast
// windows, matchup-edge rows) — no new fetch, just reshaping what's there.
export type MmPlayerInput = {
  mlbId: number
  effectiveBats: 'L' | 'R'
  pitcherHand: 'L' | 'R'
  pitcherId: number | null
  saFd: number | null
  statcastWindows: Record<'season' | 'l1' | 'l3' | 'l5' | 'l10', {
    avgBatSpeed: number | null; barrelPct: number | null; pullAirRate: number | null
    squaredUpPct: number | null; hardHitPct: number | null; avgEv: number | null; onTimePct: number | null
  } | undefined> | null | undefined
  batterMatchupData: MatchupEdgeData
}

// Computes MM for a WHOLE GAME's worth of players at once, for each of the
// board's own 4 windows — the live board ranks 'paper'/bk_rk/pp_rk across
// the entire game (both lineups combined, see DugoutClient.tsx's `pool`),
// so a Matrix's "MM" must rank across that exact same pool to ever agree
// with what a member sees in the live column. Returns null for pitcherId
// == null (no opposing pitcher yet — a projected/incomplete lineup) since
// computeMatchupEdgeScore needs a real pitch-mix row to say anything.
export function computeMmByWindowForGame(
  players: MmPlayerInput[],
  pitcherMap: PitcherMap,
  matchupEdgeByPitcher: Record<number, MatchupEdgeData>,
): Record<number, MmByWindow> {
  const windows = ['l1', 'l3', 'l5', 'l10'] as const
  const out: Record<number, MmByWindow> = {}
  for (const p of players) out[p.mlbId] = { l1: null, l3: null, l5: null, l10: null }

  for (const w of windows) {
    const rows: (RankInputRow & { mlbId: number })[] = players.map(p => {
      const pitRow = pickPitcherRow(pitcherMap, p.pitcherId, p.effectiveBats)
      const matchup_edge = computeMatchupEdgeScore(
        p.pitcherHand, p.effectiveBats, pitRow, p.batterMatchupData,
        p.pitcherId != null ? matchupEdgeByPitcher[p.pitcherId] : null,
      )
      const platoon_ops = p.batterMatchupData?.platoonOps?.[p.pitcherHand] ?? null
      const recent_pitch_count = Object.values(p.batterMatchupData?.recentByPitchTypeByHand ?? {})
        .reduce((sum: number, byType: any) => sum + Object.values(byType ?? {}).reduce((s2: number, b: any) => s2 + (b?.pitches || 0), 0), 0)
      const season = p.statcastWindows?.season
      const recent = p.statcastWindows?.[w]
      return {
        mlbId: p.mlbId,
        matchup_edge, platoon_ops, recent_pitch_count,
        s_brl: season?.barrelPct ?? null,
        s_spd: season?.avgBatSpeed ?? null, r_spd: recent?.avgBatSpeed ?? null,
        s_pa: season?.pullAirRate ?? null,
        s_sq: season?.squaredUpPct ?? null, r_sq: recent?.squaredUpPct ?? null,
        s_hh: season?.hardHitPct ?? null,
        s_ev: season?.avgEv ?? null,
        s_timing: season?.onTimePct ?? null, r_timing: recent?.onTimePct ?? null,
        sa_fd: p.saFd,
      }
    })
    computePaperScores(rows)
    computeMmRanks(rows)
    for (const r of rows) out[r.mlbId][w] = r.mm ?? null
  }
  return out
}
