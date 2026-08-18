export type MlbBatterOutcome = {
  h: number
  doubles: number
  triples: number
  hr: number
  rbi: number
  runs: number
  singles: number
  tb: number
  sb: number
  hrr: number
}

type MlbGameRef = {
  gamePk: number
  status?: { abstractGameState?: string }
}

type MlbBoxscorePlayer = {
  person?: { id?: number }
  stats?: {
    batting?: {
      hits?: number
      doubles?: number
      triples?: number
      homeRuns?: number
      rbi?: number
      runs?: number
      totalBases?: number
      stolenBases?: number
    }
  }
}

export async function fetchBoxscoreOutcomes(
  mlbGames: MlbGameRef[],
): Promise<Record<number, Record<number, MlbBatterOutcome>>> {
  const gradedPks = mlbGames
    .filter(game => {
      const status = game.status?.abstractGameState
      return status === 'Live' || status === 'Final'
    })
    .map(game => game.gamePk)
    .filter(Boolean)
  if (!gradedPks.length) return {}

  const byGamePk: Record<number, Record<number, MlbBatterOutcome>> = {}
  await Promise.all(gradedPks.map(async gamePk => {
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) return
      const feed = await response.json()
      const teams = feed?.liveData?.boxscore?.teams
      if (!teams) return
      const byMlbId: Record<number, MlbBatterOutcome> = {}
      for (const side of ['home', 'away'] as const) {
        const players = teams[side]?.players ?? {}
        for (const player of Object.values(players) as MlbBoxscorePlayer[]) {
          const mlbId = player?.person?.id
          const batting = player?.stats?.batting
          if (!mlbId || !batting) continue
          const h = batting.hits ?? 0
          const doubles = batting.doubles ?? 0
          const triples = batting.triples ?? 0
          const hr = batting.homeRuns ?? 0
          const rbi = batting.rbi ?? 0
          const runs = batting.runs ?? 0
          byMlbId[mlbId] = {
            h,
            doubles,
            triples,
            hr,
            rbi,
            runs,
            singles: Math.max(0, h - doubles - triples - hr),
            tb: batting.totalBases ?? 0,
            sb: batting.stolenBases ?? 0,
            hrr: h + runs + rbi,
          }
        }
      }
      byGamePk[gamePk] = byMlbId
    } catch {
      // Missing MLB outcome data is unavailable, never evidence of zero.
    }
  }))
  return byGamePk
}
