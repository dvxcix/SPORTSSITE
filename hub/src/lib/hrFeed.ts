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

// Live HR feed — pulled fresh from MLB's playByPlay per live/final game, same
// approach as mlb-party's builder, but enriched with hitData (exit velo,
// launch angle, distance) and the pitcher who allowed it — mlb-party's own
// feed only carries batter/inning/description, no hit or pitcher detail.
//
// Extracted from hub/src/app/api/dugout/data/route.ts (originally local to
// that route) so the hr-alerts Discord cron can call the exact same logic
// without duplicating it.
export async function fetchHrFeed(mlbGames: { gamePk: number; status?: { abstractGameState?: string } }[]): Promise<{ hrFeed: HrFeedEvent[]; pitcherIdByName: Record<string, number> }> {
  const livePks = mlbGames
    .filter((g: any) => { const s = g.status?.abstractGameState; return s === 'Live' || s === 'Final' })
    .map((g: any) => g.gamePk)
    .filter(Boolean)
  if (!livePks.length) return { hrFeed: [], pitcherIdByName: {} }

  // pitcherIdByName is built from EVERY play in the same playByPlay response
  // (not just home runs) — near_hrs (the "almost a HR" feed) only ever
  // carries pitcher_name, no id, so there's no headshot for it otherwise.
  // Reusing this already-fetched data costs zero extra requests.
  const pitcherIdByName: Record<string, number> = {}

  const results = await Promise.all(livePks.map(async (pk: number) => {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/game/${pk}/playByPlay`, { cache: 'no-store' })
      if (!r.ok) return []
      const d = await r.json()
      const plays: any[] = d.allPlays || []
      for (const p of plays) {
        const pid = p.matchup?.pitcher?.id
        const pname = p.matchup?.pitcher?.fullName
        if (pid && pname) pitcherIdByName[normName(pname)] = pid
      }
      return plays
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
    } catch { return [] }
  }))

  const hrFeed = ([] as any[]).concat(...results)
  const byGame: Record<number, any[]> = {}
  for (const h of hrFeed) { (byGame[h.game_pk] ??= []).push(h) }
  for (const pk of Object.keys(byGame)) {
    const arr = byGame[Number(pk)].sort((a, b) => a.ab_index - b.ab_index)
    if (arr[0]) arr[0].is_first_hr_of_game = true
  }
  return { hrFeed, pitcherIdByName }
}
