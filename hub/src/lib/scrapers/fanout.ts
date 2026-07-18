import { PLATFORM_URL } from '@/lib/stripe'

// Fires one request per game concurrently at this same route (passing
// gamePk) instead of looping through every game sequentially in-process —
// this is what lets a full-slate "sweep" run finish in roughly one game's
// worth of time instead of the sum of every game's time, which is what
// blew past the function's time budget when everything ran in one loop.
export async function fanOutToSelf(routePath: string, gamePks: number[]): Promise<any[]> {
  const settled = await Promise.allSettled(
    gamePks.map(async gamePk => {
      const res = await fetch(`${PLATFORM_URL}${routePath}?gamePk=${gamePk}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
      return { gamePk, status: res.status, body: await res.json().catch(() => null) }
    })
  )
  return settled.map((r, i) => r.status === 'fulfilled' ? r.value : { gamePk: gamePks[i], error: r.reason?.message ?? String(r.reason) })
}
