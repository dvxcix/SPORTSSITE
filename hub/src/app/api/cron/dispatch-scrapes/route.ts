import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame } from '@/lib/mlbSchedule'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 280

// Runs every ~2 minutes (see vercel.json). Watches scrape_dispatch_queue —
// rows the lineup-confirmed cron writes the moment a game's home+away
// lineups both go confirmed for the first time, with ready_at set 5 minutes
// out (roughly when FanDuel/BetMGM's First Home Run market actually
// appears for that game). This is the FAST path to a real opening line,
// timed to the market's own availability instead of blind polling. The
// existing 5x/day scrape-fanduel/scrape-mgm schedule still runs
// independently as an intraday line-movement sweep — this route only
// handles the early, precise opening-line trigger.
//
// FanDuel + BetMGM only — Pikkit's pick counts need continuous refreshing
// throughout the pregame window instead (see poll-pikkit-picks, every 30
// min), not a one-shot "opening" capture.
//
// Claims due rows atomically (UPDATE ... RETURNING) before firing anything,
// so two overlapping dispatcher runs can't double-fire the same game. Rows
// for a game that's already gone live by the time we get to it (lineup
// posted unusually close to first pitch) are claimed-and-skipped rather
// than scraped — the odds page has moved on by then.
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

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  const statusByGamePk = new Map(games.map(g => [g.gamePk, g.status]))

  const live = due.filter(row => !isPregame(statusByGamePk.get(row.game_pk) ?? ''))
  const toScrape = due.filter(row => isPregame(statusByGamePk.get(row.game_pk) ?? ''))

  const routes = ['/api/cron/scrape-fanduel', '/api/cron/scrape-mgm']
  const results = await Promise.allSettled(
    toScrape.flatMap(row => routes.map(async routePath => {
      const res = await fetch(`${PLATFORM_URL}${routePath}?gamePk=${row.game_pk}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
      return { gamePk: row.game_pk, route: routePath, status: res.status }
    }))
  )

  return NextResponse.json({
    ok: true,
    dispatched: toScrape.length,
    skippedAlreadyLive: live.map(r => r.game_pk),
    gamePks: toScrape.map(r => r.game_pk),
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? String(r.reason) }),
  })
}
