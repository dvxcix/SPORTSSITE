import { NextResponse } from 'next/server'

export const revalidate = 0

// Same real game as /api/allstar/data — see that route's comment for how
// this gamePk was confirmed. Split into its own fast-polling endpoint since
// this only needs the live boxscore + play-by-play, not the full
// roster/Statcast join.
const ASG_GAME_PK = 823443

export async function GET() {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${ASG_GAME_PK}/feed/live`, {
      cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
    })
    if (!res.ok) {
      return NextResponse.json({ gameState: null, players: {}, firstPaResult: {}, firstHrMlbId: null }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const feed = await res.json()

    const gameState: string | null = feed.gameData?.status?.abstractGameState ?? null

    // Real per-player counting stats straight from MLB's own live boxscore —
    // already aggregated server-side by MLB, no need to sum play-by-play.
    const players: Record<number, {
      hits: number; hr: number; doubles: number; triples: number
      rbi: number; runs: number; totalBases: number; pa: number
    }> = {}
    const boxTeams = feed.liveData?.boxscore?.teams ?? {}
    for (const side of ['away', 'home'] as const) {
      const raw = boxTeams[side]?.players ?? {}
      for (const key of Object.keys(raw)) {
        const p = raw[key]
        const b = p.stats?.batting
        const id = p.person?.id
        if (!b || !id) continue
        players[id] = {
          hits: b.hits ?? 0, hr: b.homeRuns ?? 0, doubles: b.doubles ?? 0, triples: b.triples ?? 0,
          rbi: b.rbi ?? 0, runs: b.runs ?? 0, totalBases: b.totalBases ?? 0, pa: b.plateAppearances ?? 0,
        }
      }
    }

    // First-PA result per batter + the game's real chronological first HR —
    // only derivable from play order, not the boxscore totals above.
    const allPlays = feed.liveData?.plays?.allPlays ?? []
    const seenFirstPa = new Set<number>()
    const firstPaResult: Record<number, 'hr' | 'other'> = {}
    let firstHrMlbId: number | null = null
    for (const play of allPlays) {
      if (!play.about?.isComplete) continue
      const batterId = play.matchup?.batter?.id
      const eventType = play.result?.eventType
      if (batterId && !seenFirstPa.has(batterId)) {
        seenFirstPa.add(batterId)
        firstPaResult[batterId] = eventType === 'home_run' ? 'hr' : 'other'
      }
      if (eventType === 'home_run' && batterId != null && firstHrMlbId == null) {
        firstHrMlbId = batterId
      }
    }

    return NextResponse.json(
      { gameState, players, firstPaResult, firstHrMlbId },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    )
  } catch {
    return NextResponse.json({ gameState: null, players: {}, firstPaResult: {}, firstHrMlbId: null }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
