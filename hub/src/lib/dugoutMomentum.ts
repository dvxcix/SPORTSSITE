import { computePaperScores, type PaperInputRow } from './dugoutPaperScore.ts'

export const DUGOUT_MOMENTUM_WINDOWS = ['l10', 'l5', 'l3', 'l1'] as const

export type DugoutMomentumWindow = (typeof DUGOUT_MOMENTUM_WINDOWS)[number]
export type DugoutPaperWindowInput = Omit<PaperInputRow, 'paper'>
export type DugoutMomentumDirection = 'up' | 'down' | 'steady' | 'mixed' | 'unknown'

export type DugoutMomentumResult = {
  direction: DugoutMomentumDirection
  score: number | null
  slipsurgeTrend: number | null
  paperTrend: number | null
  level: number
  label: string
}

export type DugoutMomentumInputRow = {
  mechanics_windows: Partial<Record<DugoutMomentumWindow, { index?: number | null }>>
  paper_inputs_by_window: Partial<Record<DugoutMomentumWindow, DugoutPaperWindowInput>>
  paper_windows: Partial<Record<DugoutMomentumWindow, number | null>>
  paper_percentile_windows: Partial<Record<DugoutMomentumWindow, number | null>>
  momentum: DugoutMomentumResult
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// A least-squares trend uses every available window instead of allowing one
// noisy L1 value to overwrite the player's full L10 -> L5 -> L3 -> L1 path.
// x is intentionally evenly spaced: these are nested recency views, not four
// observations separated by literal equal amounts of clock time.
export function seriesTrend(values: Array<number | null | undefined>): number | null {
  const points = values
    .map((value, index) => ({ x: index / Math.max(1, values.length - 1), y: value }))
    .filter((point): point is { x: number; y: number } => finite(point.y))
  if (points.length < 2) return null

  const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0)
  const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0)
  return denominator > 0 ? numerator / denominator : null
}

function percentileMap(values: Array<number | null>): Array<number | null> {
  const populated = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => finite(entry.value))
    .sort((a, b) => a.value - b.value)
  const result = values.map(() => null as number | null)
  if (!populated.length) return result
  if (populated.length === 1) {
    result[populated[0].index] = 50
    return result
  }

  for (let start = 0; start < populated.length;) {
    let end = start
    while (end + 1 < populated.length && populated[end + 1].value === populated[start].value) end += 1
    const averageRank = (start + end) / 2
    const percentile = averageRank / (populated.length - 1) * 100
    for (let index = start; index <= end; index += 1) result[populated[index].index] = percentile
    start = end + 1
  }
  return result
}

function rounded(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10
}

/**
 * Computes the public-facing form battery for a full-game player pool.
 * Paper Score is recomputed independently for every window against the same
 * 18-player pool, converted to a game percentile, then blended equally with
 * the 0-100 SlipSurge Score trend. The final fill is scaled separately among
 * improving and regressing players so each game reveals its strongest mover.
 */
export function computeDugoutMomentum<T extends DugoutMomentumInputRow>(rows: T[]): void {
  for (const window of DUGOUT_MOMENTUM_WINDOWS) {
    const paperRows = rows.map((row, rowIndex) => ({
      ...(row.paper_inputs_by_window[window] ?? {
        matchup_edge: null,
        s_brl: null,
        s_spd: null,
        r_spd: null,
        platoon_ops: null,
        s_pa: null,
        s_sq: null,
        r_sq: null,
        s_hh: null,
        s_ev: null,
        s_timing: null,
        r_timing: null,
        recent_pitch_count: null,
      }),
      rowIndex,
      paper: null as number | null,
    }))
    computePaperScores(paperRows)
    const percentiles = percentileMap(paperRows.map(row => row.paper))
    for (const paperRow of paperRows) {
      rows[paperRow.rowIndex].paper_windows[window] = paperRow.paper
      rows[paperRow.rowIndex].paper_percentile_windows[window] = percentiles[paperRow.rowIndex]
    }
  }

  for (const row of rows) {
    const slipsurgeTrend = seriesTrend(DUGOUT_MOMENTUM_WINDOWS.map(window => row.mechanics_windows[window]?.index))
    const paperTrend = seriesTrend(DUGOUT_MOMENTUM_WINDOWS.map(window => row.paper_percentile_windows[window]))
    const available = [slipsurgeTrend, paperTrend].filter(finite)
    const score = available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null
    const opposing = slipsurgeTrend != null && paperTrend != null
      && Math.sign(slipsurgeTrend) !== Math.sign(paperTrend)
      && Math.abs(slipsurgeTrend) >= 4 && Math.abs(paperTrend) >= 4
    const direction: DugoutMomentumDirection = score == null
      ? 'unknown'
      : opposing && Math.abs(score) < 5
        ? 'mixed'
        : score >= 3
          ? 'up'
          : score <= -3
            ? 'down'
            : 'steady'
    row.momentum = {
      direction,
      score: rounded(score),
      slipsurgeTrend: rounded(slipsurgeTrend),
      paperTrend: rounded(paperTrend),
      level: direction === 'unknown' ? 0 : direction === 'steady' || direction === 'mixed' ? 0.18 : 0,
      label: direction === 'up' ? 'Charging' : direction === 'down' ? 'Cooling' : direction === 'mixed' ? 'Mixed' : direction === 'steady' ? 'Steady' : 'No trend',
    }
  }

  const strongestUp = Math.max(0, ...rows.map(row => row.momentum.direction === 'up' ? Math.abs(row.momentum.score ?? 0) : 0))
  const strongestDown = Math.max(0, ...rows.map(row => row.momentum.direction === 'down' ? Math.abs(row.momentum.score ?? 0) : 0))
  for (const row of rows) {
    const { direction, score } = row.momentum
    if (direction === 'up' && strongestUp > 0) row.momentum.level = 0.28 + 0.72 * Math.abs(score ?? 0) / strongestUp
    if (direction === 'down' && strongestDown > 0) row.momentum.level = 0.28 + 0.72 * Math.abs(score ?? 0) / strongestDown
  }
}
