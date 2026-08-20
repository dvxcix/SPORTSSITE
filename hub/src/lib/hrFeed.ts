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
  batter_pa_number: number
  ab_index: number
  desc: string
  exit_velocity: number | null
  launch_angle: number | null
  hit_distance: number | null
  hc_x?: number | null
  hc_y?: number | null
  hr_time: string | null
  rbi_on_play: number
  is_grand_slam: boolean
}

export type MlbContactFeedEvent = {
  game_pk: number
  batter_name: string
  batter_mlb_id: number | null
  pitcher_name: string | null
  pitcher_mlb_id: number | null
  inning: number | undefined
  half: string | undefined
  ab_index: number
  pitch_number: number
  event_type: string
  desc: string
  event_time: string | null
  exit_velocity: number | null
  launch_angle: number | null
  hit_distance: number | null
  hc_x: number | null
  hc_y: number | null
  pitch_type: string | null
  pitch_speed: number | null
  bb_type: string | null
  rbi_on_play: number
}

export type HrFeedFailure = {
  gamePk: number
  reason: string
}

export type HrFeedResult = {
  hrFeed: HrFeedEvent[]
  /** Every official fair ball in play available from MLB Gameday. */
  contactFeed: MlbContactFeedEvent[]
  pitcherIdByName: Record<string, number>
  /** Games whose play-by-play response was fetched and parsed successfully. */
  completedGamePks: number[]
  /** A failed request is unknown, never evidence that a game had zero HRs. */
  failures: HrFeedFailure[]
}

type MlbPlayEvent = {
  index?: number
  pitchNumber?: number
  details?: { isInPlay?: boolean; type?: { code?: string; description?: string } }
  hitData?: {
    launchSpeed?: number
    launchAngle?: number
    totalDistance?: number
    trajectory?: string
    coordinates?: { coordX?: number; coordY?: number }
  }
  pitchData?: { startSpeed?: number }
}

type MlbPlay = {
  atBatIndex?: number
  playEvents?: MlbPlayEvent[]
  matchup?: {
    batter?: { id?: number; fullName?: string }
    pitcher?: { id?: number; fullName?: string }
  }
  about?: { inning?: number; halfInning?: string; startTime?: string; endTime?: string }
  result?: { eventType?: string; description?: string; rbi?: number }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type HrFeedFetchOptions = {
  attempts?: number
  timeoutMs?: number
}

async function fetchPlayByPlay(gamePk: number, options: HrFeedFetchOptions = {}) {
  const attempts = Math.max(1, Math.min(3, Math.trunc(options.attempts ?? 3)))
  const timeoutMs = Math.max(2_000, Math.min(20_000, Math.trunc(options.timeoutMs ?? 20_000)))
  let lastReason = 'Unknown MLB play-by-play failure'
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        lastReason = `MLB play-by-play returned HTTP ${response.status}`
      } else {
        const body = await response.json() as { allPlays?: unknown }
        if (Array.isArray(body.allPlays)) return body.allPlays as MlbPlay[]
        lastReason = 'MLB play-by-play response did not contain allPlays'
      }
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error)
    }
    if (attempt < attempts - 1) await wait(250 * (attempt + 1))
  }
  throw new Error(lastReason)
}

function inPlayEvent(play: MlbPlay) {
  const events = play?.playEvents ?? []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.details?.isInPlay && events[index]?.hitData) return events[index]
  }
  return null
}

export function parseMlbContactEvents(gamePk: number, plays: MlbPlay[]): MlbContactFeedEvent[] {
  return plays.flatMap(play => {
    const event = inPlayEvent(play)
    const x = event?.hitData?.coordinates?.coordX
    const y = event?.hitData?.coordinates?.coordY
    if (!event || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return []
    return [{
      game_pk: gamePk,
      batter_name: play.matchup?.batter?.fullName ?? '',
      batter_mlb_id: play.matchup?.batter?.id ?? null,
      pitcher_name: play.matchup?.pitcher?.fullName ?? null,
      pitcher_mlb_id: play.matchup?.pitcher?.id ?? null,
      inning: play.about?.inning,
      half: play.about?.halfInning,
      ab_index: Number(play.atBatIndex ?? 0),
      pitch_number: Number(event.pitchNumber ?? event.index ?? 0),
      event_type: play.result?.eventType ?? 'ball_in_play',
      desc: play.result?.description ?? '',
      event_time: play.about?.endTime ?? play.about?.startTime ?? null,
      exit_velocity: event.hitData?.launchSpeed ?? null,
      launch_angle: event.hitData?.launchAngle ?? null,
      hit_distance: event.hitData?.totalDistance ?? null,
      hc_x: Number(x),
      hc_y: Number(y),
      pitch_type: event.details?.type?.code ?? event.details?.type?.description ?? null,
      pitch_speed: event.pitchData?.startSpeed ?? null,
      bb_type: event.hitData?.trajectory ?? null,
      rbi_on_play: Number(play.result?.rbi ?? 0),
    }]
  })
}

// Live HR feed — pulled fresh from MLB's playByPlay per live/final game, same
// approach as mlb-party's builder, but enriched with hitData (exit velo,
// launch angle, distance) and the pitcher who allowed it — mlb-party's own
// feed only carries batter/inning/description, no hit or pitcher detail.
//
// Extracted from hub/src/app/api/dugout/data/route.ts (originally local to
// that route) so the hr-alerts Discord cron can call the exact same logic
// without duplicating it.
export async function fetchHrFeed(
  mlbGames: { gamePk: number; status?: { abstractGameState?: string } }[],
  options: HrFeedFetchOptions = {},
): Promise<HrFeedResult> {
  const livePks = mlbGames
    .filter(g => { const s = g.status?.abstractGameState; return s === 'Live' || s === 'Final' })
    .map(g => g.gamePk)
    .filter(Boolean)
  if (!livePks.length) return { hrFeed: [], contactFeed: [], pitcherIdByName: {}, completedGamePks: [], failures: [] }

  // pitcherIdByName is built from EVERY play in the same playByPlay response
  // (not just home runs) — near_hrs (the "almost a HR" feed) only ever
  // carries pitcher_name, no id, so there's no headshot for it otherwise.
  // Reusing this already-fetched data costs zero extra requests.
  const pitcherIdByName: Record<string, number> = {}

  const completedGamePks: number[] = []
  const failures: HrFeedFailure[] = []
  const results: HrFeedEvent[][] = new Array(livePks.length)
  const contactResults: MlbContactFeedEvent[][] = new Array(livePks.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(4, livePks.length) }, async () => {
    while (cursor < livePks.length) {
      const index = cursor
      cursor += 1
      const pk = livePks[index]
      try {
        const plays = await fetchPlayByPlay(pk, options)
        completedGamePks.push(pk)
        for (const p of plays) {
          const pid = p.matchup?.pitcher?.id
          const pname = p.matchup?.pitcher?.fullName
          if (pid && pname) pitcherIdByName[normName(pname)] = pid
        }
        const paNumberByPlay = new Map<MlbPlay, number>()
        const paCountByBatter = new Map<number, number>()
        for (const play of plays) {
          const batterId = play.matchup?.batter?.id
          if (!batterId) continue
          const paNumber = (paCountByBatter.get(batterId) ?? 0) + 1
          paCountByBatter.set(batterId, paNumber)
          paNumberByPlay.set(play, paNumber)
        }
        contactResults[index] = parseMlbContactEvents(pk, plays)
        results[index] = plays
          .filter(p => p.result?.eventType === 'home_run')
          .map(p => {
            const hitEvent = inPlayEvent(p)
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
              batter_pa_number: paNumberByPlay.get(p) ?? 0,
              ab_index: p.atBatIndex ?? 0,
              desc: p.result?.description || '',
              exit_velocity: hitEvent?.hitData?.launchSpeed ?? null,
              launch_angle: hitEvent?.hitData?.launchAngle ?? null,
              hit_distance: hitEvent?.hitData?.totalDistance ?? null,
              hc_x: hitEvent?.hitData?.coordinates?.coordX ?? null,
              hc_y: hitEvent?.hitData?.coordinates?.coordY ?? null,
              rbi_on_play: Number(p.result?.rbi ?? 0),
              is_grand_slam: Number(p.result?.rbi ?? 0) === 4,
              // Real wall-clock moment the HR happened - needed to sort
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
        contactResults[index] = []
      }
    }
  })
  await Promise.all(workers)

  const hrFeed = results.flat()
  const contactFeed = contactResults.flat()
  const byGame: Record<number, HrFeedEvent[]> = {}
  for (const h of hrFeed) { (byGame[h.game_pk] ??= []).push(h) }
  for (const pk of Object.keys(byGame)) {
    const arr = byGame[Number(pk)].sort((a, b) => a.ab_index - b.ab_index)
    if (arr[0]) arr[0].is_first_hr_of_game = true
  }
  return { hrFeed, contactFeed, pitcherIdByName, completedGamePks, failures }
}
