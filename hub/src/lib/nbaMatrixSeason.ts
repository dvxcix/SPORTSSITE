import type { PaintBoard, PaintPlayer } from './nbaPaint'
import { nbaSeasonDisplayBoard } from './nbaSeasonDisplay'
import { nbaSeasonTrackingView } from './nbaSeasonTrackingView'
import type { NbaMatrixFactor, NbaMatrixPipelineStep } from './nbaMatrix'
import type { NbaTrackingRow } from './nbaTracking'

type Tracking = { rows: NbaTrackingRow[]; seasons: number[]; complete: boolean; sourceStates?: {key: string; complete?: boolean}[]; fields: string[] }
type Defense = {season: number; before: string; ready: boolean; profiles: unknown[]}
const day = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const ms = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v
}
/** Proof checks against original, unmodified research; never re-rank a filtered board. */
export function nbaMatrixSeasonGuard(board: PaintBoard, defense: Defense | null, tracking: Tracking | null) {
  const season = board.game.season, before = board.game.date
  const dateValid = Number.isSafeInteger(season) && season >= 2000 && season <= 2200 && day(before)
    && before >= `${season}-07-01` && before < `${season + 1}-07-01`
  const rosterValid = board.players.every(player => Number.isSafeInteger(player.id) && player.id > 0)
    && new Set(board.players.map(player => player.id)).size === board.players.length
  const playerValid = (p: PaintPlayer) => {
    const isolated = { ...board, players: [p] }
    try {
      return dateValid && rosterValid && nbaSeasonDisplayBoard(isolated) === isolated
        && [...p.logs, ...(p.periodLogs ?? [])].every(log => (log.game.status_state == null || log.game.status_state === 'final')
          && Number.isSafeInteger(log.team?.id) && log.team.id > 0
          && (log.team.id === log.game.home_team_id || log.team.id === log.game.visitor_team_id))
    } catch { return false }
  }
  let boardValid = false
  try { boardValid = dateValid && nbaSeasonDisplayBoard(board) === board && board.players.every(playerValid) } catch { /* unavailable */ }
  const defenseValid = !!defense && defense.ready === true && dateValid && defense.season === season && Array.isArray(defense.profiles)
    && day(defense.before) && defense.before >= `${season}-07-01` && defense.before <= before
  let trackingValid = false
  try {
    if (tracking && dateValid) {
      const visible = nbaSeasonTrackingView(board, tracking)
      trackingValid = visible.complete === true && visible.rows.length === tracking.rows.length
    }
  } catch { /* unavailable */ }
  const onePlayer = new Map(board.players.map(p => [String(p.id), playerValid(p)]))
  return (id: string, factor: NbaMatrixFactor): boolean => {
    if (!rosterValid || !onePlayer.has(id)) return false
    const q1 = (factor.category === 'stats' ? factor.field : factor.propType)?.endsWith('_1q') === true
    const quarterValid = !q1 || board.periodStatsComplete === true
    if (factor.category === 'score') return boardValid && quarterValid && (factor.field === 'mm' || defenseValid)
    if (factor.category === 'stats' || factor.category === 'market' && !['current','opening','move','line','probability','probability_move'].includes(factor.marketValue ?? '')) return onePlayer.get(id) === true && quarterValid
    if (factor.category === 'tracking') return onePlayer.get(id) === true && trackingValid
    if (factor.category === 'team') return dateValid && board.teamStatsSeason === season
    return true
  }
}

/** Rank and unless cannot safely treat withheld values as absent: doing so
 * changes the compared population or converts unknown into a passing result. */
export function nbaMatrixUnsafePipelineStep(
  steps: NbaMatrixPipelineStep[], candidates: {id: string; values: (factor: NbaMatrixFactor) => number | null}[],
  proven: (id: string, factor: NbaMatrixFactor) => boolean,
) {
  // An earlier unproven filter also changes the pool seen by a later rank or
  // unless step. Conservatively withhold the affected pipeline as a whole.
  return steps.some(step => step.kind === 'rank' || step.kind === 'unless')
    && steps.some(step => step.kind !== 'group' && candidates.some(candidate => {
      if (!proven(candidate.id, step)) return true
      const value = candidate.values(step)
      return value == null || !Number.isFinite(value)
    }))
}
