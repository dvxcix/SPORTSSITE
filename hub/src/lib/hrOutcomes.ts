import { normName } from '@slipsurge/core/nameNorm'

export type HrOutcomeGame = {
  gamePk: number
  homeAbbr: string
  awayAbbr: string
}

export type OfficialHrHitter = {
  mlbId: number | null
  name: string
  nameNorm: string
  team: string
  homeRuns: number
}

export type OfficialHrOutcome = {
  gamePk: number
  anytimeGraded: boolean
  fhrGraded: boolean
  totalHomeRuns: number
  hitters: OfficialHrHitter[]
  firstHr: OfficialHrHitter | null
  issues: string[]
}

function countsMatch(left: Map<string, number>, right: Map<string, number>): boolean {
  if (left.size !== right.size) return false
  for (const [key, count] of left) if (right.get(key) !== count) return false
  return true
}

function hitterKey(mlbId: number | null, name: string): string {
  return mlbId ? `id:${mlbId}` : `name:${normName(name)}`
}

// Anytime-HR settlement comes from the final box score. Play-by-play is used
// only for ordering, and therefore only grades FHR after its complete HR
// multiset reconciles exactly with the box score. A partial play feed can no
// longer turn real homers into a false no-HR game.
export async function fetchOfficialHrOutcomes(games: HrOutcomeGame[]): Promise<Map<number, OfficialHrOutcome>> {
  const entries = await Promise.all(games.map(async game => {
    const issues: string[] = []
    let anytimeGraded = false
    let hitters: OfficialHrHitter[] = []
    let totalHomeRuns = 0
    const boxCounts = new Map<string, number>()

    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${game.gamePk}/feed/live`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`box score HTTP ${response.status}`)
      const feed = await response.json()
      const final = feed?.gameData?.status?.abstractGameState === 'Final'
        || /final/i.test(feed?.gameData?.status?.detailedState ?? '')
      const teams = feed?.liveData?.boxscore?.teams
      if (!final || !teams?.home?.players || !teams?.away?.players) {
        issues.push('Final box score is unavailable or incomplete.')
      } else {
        anytimeGraded = true
        for (const side of ['away', 'home'] as const) {
          const team = side === 'home' ? game.homeAbbr : game.awayAbbr
          for (const player of Object.values(teams[side].players) as any[]) {
            const homeRuns = Number(player?.stats?.batting?.homeRuns ?? 0)
            if (!Number.isFinite(homeRuns) || homeRuns <= 0) continue
            const mlbId = Number(player?.person?.id) || null
            const name = String(player?.person?.fullName ?? '')
            const hitter = { mlbId, name, nameNorm: normName(name), team, homeRuns }
            hitters.push(hitter)
            totalHomeRuns += homeRuns
            boxCounts.set(hitterKey(mlbId, name), homeRuns)
          }
        }
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error))
    }

    let fhrGraded = false
    let firstHr: OfficialHrHitter | null = null
    if (anytimeGraded) {
      try {
        const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${game.gamePk}/playByPlay`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`play-by-play HTTP ${response.status}`)
        const data = await response.json()
        const homeRuns = (Array.isArray(data?.allPlays) ? data.allPlays : [])
          .filter((play: any) => play?.result?.eventType === 'home_run')
          .sort((a: any, b: any) => Number(a?.atBatIndex ?? 0) - Number(b?.atBatIndex ?? 0))
        const playCounts = new Map<string, number>()
        for (const play of homeRuns) {
          const mlbId = Number(play?.matchup?.batter?.id) || null
          const name = String(play?.matchup?.batter?.fullName ?? '')
          const key = hitterKey(mlbId, name)
          playCounts.set(key, (playCounts.get(key) ?? 0) + 1)
        }
        if (!countsMatch(boxCounts, playCounts)) {
          issues.push(`Play-by-play HR count (${homeRuns.length}) does not reconcile with box score (${totalHomeRuns}).`)
        } else {
          fhrGraded = true
          const first = homeRuns[0]
          if (first) {
            const firstId = Number(first?.matchup?.batter?.id) || null
            const firstName = String(first?.matchup?.batter?.fullName ?? '')
            firstHr = hitters.find(hitter => hitterKey(hitter.mlbId, hitter.name) === hitterKey(firstId, firstName)) ?? null
          }
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error))
      }
    }

    return [game.gamePk, {
      gamePk: game.gamePk,
      anytimeGraded,
      fhrGraded,
      totalHomeRuns,
      hitters,
      firstHr,
      issues,
    } satisfies OfficialHrOutcome] as const
  }))

  return new Map(entries)
}
