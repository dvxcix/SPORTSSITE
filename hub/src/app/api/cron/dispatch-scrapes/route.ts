import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 280

// Runs every ~2 minutes (see vercel.json). Watches scrape_dispatch_queue —
// rows the lineup-confirmed cron writes the moment a game's home+away
// lineups both go confirmed for the first time, with ready_at set 5 minutes
// out (roughly when FanDuel's First Home Run market actually appears for
// that game). This is the FAST path to a real opening line, timed to the
// market's own availability instead of blind polling. The existing 5x/day
// scrape-* schedule still runs independently as a backstop/line-movement
// sweep — this route only handles the early, precise trigger.
//
// Claims due rows atomically (UPDATE ... RETURNING) before firing anything,
// so two overlapping dispatcher runs can't double-fire the same game.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: due, error } = await admin
    .from('scrape_dispatch_queue')
    .update({ dispatched_at: nowIso })
    .is('dispatched_at', null)
    .lte('ready_at', nowIso)
    .select('game_pk')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due?.length) return NextResponse.json({ ok: true, dispatched: 0 })

  const routes = ['/api/cron/scrape-fanduel', '/api/cron/scrape-mgm', '/api/cron/scrape-pikkit']
  const results = await Promise.allSettled(
    due.flatMap(row => routes.map(async routePath => {
      const res = await fetch(`${PLATFORM_URL}${routePath}?gamePk=${row.game_pk}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
      return { gamePk: row.game_pk, route: routePath, status: res.status }
    }))
  )

  return NextResponse.json({
    ok: true,
    dispatched: due.length,
    gamePks: due.map(r => r.game_pk),
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? String(r.reason) }),
  })
}
