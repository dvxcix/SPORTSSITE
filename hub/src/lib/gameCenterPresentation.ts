import type { ESPNGame, ESPNSummary } from '@slipsurge/core/espn-api'

/** Summary status is authoritative, including historical games absent from today's scoreboard. */
export function gameCenterStatus(summary: ESPNSummary | null, game: ESPNGame | null, fallback: { state: string; label: string; isLive: boolean }) {
  const status = summary?.header?.competitions?.[0]?.status ?? game?.status
  if (!status) return fallback
  const state = status.type.state
  return { state, label: status.type.shortDetail || (state === 'post' ? 'Final' : state === 'in' ? 'Live' : fallback.label), isLive: state === 'in' }
}

export function basketballQuarters(summary: ESPNSummary | null) {
  const competitors = summary?.header?.competitions?.[0]?.competitors ?? []
  type Lines = { linescores?: { value?: number; displayValue?: string }[] }
  const count = Math.max(4, ...competitors.map(team => (team as Lines).linescores?.length ?? 0))
  return [...competitors].sort((a,b) => a.homeAway === b.homeAway ? 0 : a.homeAway === 'away' ? -1 : 1).map(team => ({
    team: team.team.abbreviation, logo: team.team.logo, total: team.score,
    periods: Array.from({length: count}, (_,i) => {
      const line = (team as Lines).linescores?.[i]
      const value = line?.value ?? (line?.displayValue ? Number(line.displayValue) : null)
      return value != null && Number.isFinite(value) ? value : null
    }),
  }))
}
