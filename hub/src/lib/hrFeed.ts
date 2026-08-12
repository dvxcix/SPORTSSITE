import { normName } from '@slipsurge/core/nameNorm'

export type HrFeedEvent = {
  game_pk: number
  player_name: string
  name_norm: string
  mlb_id: number | null
  pitcher_name: string | null
  pitcher_mlb_id: number | null
  inning: number | undefined
  half: string | undefined
  is_first_hr_of_game: boolean
  ab_index: number
  desc: string
  exit_velocity: number | null
  launch_angle: number | null
  hit_distance: number | null
  hr_time: string | null
}

export type HrFeedFailure = {
  gamePk: number
  reason: string
}

export type HrFeedResult = {
  hrFeed: HrFeedEvent[]
  pitcherIdByName: Record<string, number>
  /** Games whose play-by-play response was fetched and parsed successfully. */
  completedGamePks: number[]
  /** A failed request is unknown, never evidence that a game had zero HRs. */
  failures: HrFeedFailure[]
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchPlayByPlay(gamePk: number) {
  let lastReason = 'Unknown MLB play-by-play failure'
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        lastReason = `MLB play-by-play returned HTTP ${response.status}`
      } else {
        const body = await response.json()
        if (Array.isArray(body?.allPlays)) return body.allPlays as any[]
        lastReason = 'MLB play-by-play response did not contain allPlays'
      }
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error)
    }
    if (attempt < 2) await wait(250 * (attempt + 1))
  }
  throw new Error(lastReason)
}

// Live HR feed — pulled fresh from MLB's playByPlay per live/final game, same
// approach as mlb-party's builder, but enriched with hitData (exit velo,
// launch angle, distance) and the pitcher who allowed it — mlb-party's own
// feed only carries batter/inning/description, no hit or pitcher detail.
//
// Extracted from hub/src/app/api/dugout/data/route.ts (originally local to
// that route) so the hr-alerts Discord cron can call the exact same logic
// without duplicating it.
export async function fetchHrFeed(mlbGames: { gamePk: number; status?: { abstractGameState?: string } }[]): Promise<HrFeedResult> {
  const livePks = mlbGames
    .filter((g: any) => { const s = g.status?.abstractGameState; return s === 'Live' || s === 'Final' })
    .map((g: any) => g.gamePk)
    .filter(Boolean)
  if (!livePks.length) return { hrFeed: [], pitcherIdByName: {}, completedGamePks: [], failures: [] }

  // pitcherIdByName is built from EVERY play in the same playByPlay response
  // (not just home runs) — near_hrs (the "almost a HR" feed) only ever
  // carries pitcher_name, no id, so there's no headshot for it otherwise.
  // Reusing this already-fetched data costs zero extra requests.
  const pitcherIdByName: Record<string, number> = {}

  const completedGamePks: number[] = []
  const failures: HrFeedFailure[] = []
  const results: HrFeedEvent[][] = new Array(livePks.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(4, livePks.length) }, async () => {
    while (cursor < livePks.length) {
      const index = cursor
      cursor += 1
      const pk = livePks[index]
      try {
        const plays = await fetchPlayByPlay(pk)
        completedGamePks.push(pk)
      for (const p of plays) {
        const pid = p.matchup?.pitcher?.id
        const pname = p.matchup?.pitcher?.fullName
        if (pid && pname) pitcherIdByName[normName(pname)] = pid
      }
        results[index] = plays
        .filter(p => p.result?.eventType === 'home_run')
        .map(p => {
          const hitEvent = (p.playEvents || []).find((e: any) => e.details?.isInPlay && e.hitData)
          return {
            game_pk: pk,
            player_name: p.matchup?.batter?.fullName || '',
            name_norm: normName(p.matchup?.batter?.fullName || ''),
            mlb_id: p.matchup?.batter?.id || null,
            pitcher_name: p.matchup?.pitcher?.fullName || null,
            pitcher_mlb_id: p.matchup?.pitcher?.id || null,
            inning: p.about?.inning,
            half: p.about?.halfInning,
            is_first_hr_of_game: false, // filled below
            ab_index: p.atBatIndex ?? 0,
            desc: p.result?.description || '',
            exit_velocity: hitEvent?.hitData?.launchSpeed ?? null,
            launch_angle: hitEvent?.hitData?.launchAngle ?? null,
            hit_distance: hitEvent?.hitData?.totalDistance ?? null,
            // Real wall-clock moment the HR happened — needed to sort
            // "Today's Home Runs" chronologically ACROSS games. ab_index only
            // orders at-bats within one game; two games' at-bats have no
            // relationship to each other, so sorting by ab_index (or game_pk)
            // groups everything by game first instead of real slate order.
            hr_time: p.about?.endTime ?? p.about?.startTime ?? null,
          }
        })
      } catch (error) {
        failures.push({ gamePk: pk, reason: error instanceof Error ? error.message : String(error) })
        results[index] = []
      }
    }
  })
  await Promise.all(workers)

  const hrFeed = ([] as any[]).concat(...results)
  const byGame: Record<number, any[]> = {}
  for (const h of hrFeed) { (byGame[h.game_pk] ??= []).push(h) }
  for (const pk of Object.keys(byGame)) {
    const arr = byGame[Number(pk)].sort((a, b) => a.ab_index - b.ab_index)
    if (arr[0]) arr[0].is_first_hr_of_game = true
  }
  return { hrFeed, pitcherIdByName, completedGamePks, failures }
}
