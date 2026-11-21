import { nbaSample, type PaintBoard, type PaintMarket } from './nbaPaint'
import { nbaWorkloadBoard, type NbaWorkload } from './nbaWorkload'
import type { NbaTrackingRow } from './nbaTracking'

type CoreMarket = 'points' | 'rebounds' | 'assists' | 'threes'
const components: Partial<Record<PaintMarket, CoreMarket[]>> = {
  points: ['points'], rebounds: ['rebounds'], assists: ['assists'], threes: ['threes'],
  points_rebounds: ['points', 'rebounds'], points_assists: ['points', 'assists'],
  rebounds_assists: ['rebounds', 'assists'], points_rebounds_assists: ['points', 'rebounds', 'assists'],
  double_double: ['points', 'rebounds', 'assists'], triple_double: ['points', 'rebounds', 'assists'],
}
export const nbaScoreNeedsTracking = (market: string) => (components[market as PaintMarket] ?? []).some(key => key === 'rebounds' || key === 'assists')
const absent = (status: string | undefined) => /^(out|inactive|suspended)$/i.test(status?.trim() ?? '')
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export type NbaScoreWorkload = {
  market: PaintMarket; status: 'available' | 'partial' | 'unavailable' | 'unsupported'; reason: string | null
  observedAt: string | null; availabilityKnown: boolean; playerStatus: string | null; unavailablePlayer: boolean
  recentMinutes: number | null; opportunityFactor: number | null; availabilityFactor: number | null
  components: { market: CoreMarket; workload: NbaWorkload; change: number | null; availabilityFactor: number | null;
    absent: { playerId: number; name: string; status: string; share: number }[]; pool: number }[]
}

/** Prepare once from the complete, game-scoped roster, before search/contract filters.
 * Availability is a bounded score input, not invented replacement minutes or a
 * forecast. Only definite absences that participated in the team's last two
 * games enter it; an absence already reflected in those games is not counted twice.
 * Questionable/Doubtful players remain in the observed opportunity denominator. */
export function nbaScoreWorkloads(board: PaintBoard, tracking: NbaTrackingRow[] = [], observedAt: string | null = null) {
  const workloads = nbaWorkloadBoard(board, tracking, observedAt)
  const availabilityKnown = board.statsComplete && !board.issues.some(issue => /injury (coverage|report).*incomplete|injury report unavailable/i.test(issue))
  const teamGames = new Map([board.game.home_team.id, board.game.visitor_team.id].map(teamId => [teamId,
    new Set(nbaSample(board.players.filter(p => p.team.id === teamId).flatMap(p => p.logs)
      .filter(log => log.team.id === teamId && log.game.season === board.game.season && log.game.date.slice(0, 10) < board.game.date
        && (log.game.status_state === 'final' || log.game.status === 'Final')), 1000)
      .map(log => log.game.id).filter((id, index, all) => all.indexOf(id) === index).slice(0, 2))] as const))
  const cache = new Map<string, NbaScoreWorkload>()
  return {
    workloads,
    get(playerId: number, market: PaintMarket): NbaScoreWorkload {
      const key = `${playerId}:${market}`, cached = cache.get(key)
      if (cached) return cached
      const player = board.players.find(p => p.id === playerId)
      const result: NbaScoreWorkload = { market, status: 'unsupported', reason: 'No matching opportunity observations for this market',
        observedAt, availabilityKnown, playerStatus: player?.injury?.status ?? null,
        unavailablePlayer: availabilityKnown && absent(player?.injury?.status), recentMinutes: null,
        opportunityFactor: null, availabilityFactor: null, components: [] }
      for (const core of components[market] ?? []) {
        const workload = workloads.find(row => row.playerId === playerId && row.market === core)
        if (!workload || !player) continue
        const pool = workloads.filter(row => row.teamId === player.team.id && row.market === core && row.status === 'available' && row.priorOpportunity != null)
        const denominator = pool.reduce((sum, row) => sum + row.priorOpportunity!, 0)
        const absences = pool.flatMap(row => {
          const peer = board.players.find(p => p.id === row.playerId)
          if (!peer || peer.id === playerId || !absent(peer.injury?.status)
            || !peer.logs.some(log => log.team.id === player.team.id && teamGames.get(player.team.id)?.has(log.game.id)) || denominator <= 0) return []
          return [{ playerId: peer.id, name: `${peer.first_name} ${peer.last_name}`, status: peer.injury!.status, share: row.priorOpportunity! / denominator }]
        })
        const missingShare = absences.reduce((sum, row) => sum + row.share, 0)
        const availabilityFactor = availabilityKnown && pool.length >= 2 && denominator > 0
          ? clamp(1 / Math.max(.01, 1 - missingShare), 1, 1.25) : null
        const change = workload.status === 'available' && workload.priorOpportunity != null && workload.priorOpportunity > 0 && workload.recentOpportunity != null
          ? clamp(workload.recentOpportunity / workload.priorOpportunity, .5, 1.5) : null
        result.components.push({ market: core, workload, change, availabilityFactor, absent: availabilityKnown ? absences : [], pool: pool.length })
      }
      const usable = result.components.filter(row => row.change != null)
      result.status = !result.components.length ? 'unsupported' : !usable.length ? 'unavailable' : usable.length === result.components.length ? 'available' : 'partial'
      result.reason = result.status === 'available' ? null : result.components.length ? 'Some market-specific opportunity observations are unavailable; missing adjustments are not invented' : result.reason
      // Combo output units match the selected combined market. Binary event
      // support uses a geometric mean across PTS/REB/AST, never a made-up joint
      // hit probability. All required categories must be observed to adjust it.
      if (usable.length && usable.length === result.components.length) {
        const binary = market === 'double_double' || market === 'triple_double'
        const weight = (row: typeof usable[number]) => binary ? 1 : (row.workload.priorOpportunity ?? 0) * (row.workload.conversion ?? 0)
        const total = usable.reduce((sum, row) => sum + weight(row), 0)
        const combine = (pick: (row: typeof usable[number]) => number) => binary
          ? Math.exp(usable.reduce((sum, row) => sum + Math.log(pick(row)), 0) / usable.length)
          : total > 0 ? usable.reduce((sum, row) => sum + pick(row) * weight(row), 0) / total : null
        result.opportunityFactor = combine(row => row.change!)
        result.availabilityFactor = usable.every(row => row.availabilityFactor != null) ? combine(row => row.availabilityFactor!) : null
      }
      const minutes = result.components.map(row => row.workload.recentMinutes).filter((n): n is number => n != null && Number.isFinite(n))
      result.recentMinutes = minutes.length ? minutes.reduce((sum, n) => sum + n, 0) / minutes.length : null
      cache.set(key, result)
      return result
    },
  }
}
