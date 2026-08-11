import { unstable_cache } from 'next/cache'

async function fetchFirstPitchAt(gamePk: string): Promise<string | null> {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'SlipSurge/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    const payload = await response.json()
    for (const play of payload.allPlays ?? []) {
      for (const event of play.playEvents ?? []) {
        if (event?.type !== 'pitch') continue
        // MLB supplies pitch-level startTime. The play start is a safe
        // fallback for older/completed feeds where event timing is sparse.
        return event.startTime ?? event.endTime ?? play.about?.startTime ?? null
      }
    }
  } catch { /* a transient MLB failure must never make the board disappear */ }
  return null
}

// Shared across concurrent viewers/cron invocations. Detection may happen a
// few seconds after first pitch, but the returned MLB timestamp is exact, so
// consumers can still cut history at the real pitch rather than observation.
export const getFirstPitchAt = unstable_cache(fetchFirstPitchAt, ['mlb-first-pitch-v1'], { revalidate: 15 })

