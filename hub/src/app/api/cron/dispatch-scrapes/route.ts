import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame } from '@/lib/mlbSchedule'
import { PLATFORM_URL } from '@/lib/stripe'
import { missingMarkets } from '@/lib/scrapers/retryMarkets'

export const revalidate = 0
export const maxDuration = 280

// Runs every ~2 minutes (see vercel.json). Watches scrape_dispatch_queue —
// rows the lineup-confirmed cron writes the moment a game's home+away
// lineups both go confirmed for the first time, with ready_at set 5 minutes
// out (roughly when FanDuel's First Home Run market actually appears for
// that game). This is the FAST path to a real opening line, timed to the
// market's own availability instead of blind polling. The existing 5x/day
// scrape-fanduel schedule still runs independently as an intraday
// line-movement sweep — this route only handles the early, precise
// opening-line trigger.
//
// FanDuel only — BetMGM automation is on hold (its page never renders real
// content past the header/nav, unresolved as of now; left manual). Pikkit's
// pick counts need continuous refreshing throughout the pregame window
// instead (see poll-pikkit-picks, every 30 min), not a one-shot "opening"
// capture.
//
// Claims due rows atomically (UPDATE ... RETURNING) before firing anything,
// so two overlapping dispatcher runs can't double-fire the same game. Rows
// for a game that's already gone live by the time we get to it (lineup
// posted unusually close to first pitch) are claimed-and-skipped rather
// than scraped — the odds page has moved on by then.
//
// Books sometimes don't post "To Hit First Home Run" the instant the lineup
// confirms — confirmed live on a real game where the 5-min-delayed scrape
// landed with every other market populated but fhr_fd completely absent.
// If a scrape comes back with no FHR data, re-queue that same game for
// another attempt 5 minutes out rather than accepting a permanently
// FHR-less opening line. Capped at one retry (retry_count) so a game that
// genuinely never gets an FHR market (or one already past its window)
// doesn't loop forever.
//
// Real gap (2026-07-25): FHR had this check, nothing else did — confirmed
// live across a full day's slate, TWO distinct silent tab-scrape misses:
// (1) fhr_fd/rbi3_fd/combo1_min/combo2_min all zero together on 7 games,
// (2) laser105_fd/laser110_fd/moonshot_fd/pa1_fd all zero together on 2
// games (one game hit both) — see lib/scrapers/retryMarkets.ts for the
// full list and why each entry on it is a safe zero-means-miss signal.
//
// scrape-fanduel/route.ts's own scrapeOneGame now does ONE same-request
// retry itself the moment it sees any of these at zero — this queue-based
// retry is the SECOND layer, for whatever's still missing after that (the
// market genuinely isn't posted yet, not just a one-off tab glitch) —
// waits 5 real minutes rather than immediately hammering the same still-
// not-ready page again. Capped at one retry (retry_count) so a game that
// genuinely never gets a market (or one already past its window) doesn't
// loop forever.
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
    .select('game_pk, retry_count')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due?.length) return NextResponse.json({ ok: true, dispatched: 0 })

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  const statusByGamePk = new Map(games.map(g => [g.gamePk, g.status]))

  const live = due.filter(row => !isPregame(statusByGamePk.get(row.game_pk) ?? ''))
  const toScrape = due.filter(row => isPregame(statusByGamePk.get(row.game_pk) ?? ''))

  const results = await Promise.allSettled(
    toScrape.map(async row => {
      const res = await fetch(`${PLATFORM_URL}/api/cron/scrape-fanduel?gamePk=${row.game_pk}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
      const body = await res.json().catch(() => null)
      // scrape-fanduel's own scrapeOneGame already retried once same-request
      // — `stillMissing` is what survived THAT retry. Fall back to deriving
      // it from marketSummary directly for an older/error-shaped response
      // that never got that far.
      const stillMissing: string[] = body?.result?.stillMissing
        ?? missingMarkets(body?.result?.imported?.body?.marketSummary ?? {})
      return { gamePk: row.game_pk, status: res.status, stillMissing, retryCount: row.retry_count }
    })
  )

  const fulfilled = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter((r): r is { gamePk: number; status: number; stillMissing: string[]; retryCount: number } => r !== null)

  const needsRetry = fulfilled.filter(r => r.status === 200 && r.retryCount < 1 && r.stillMissing.length > 0)
  if (needsRetry.length) {
    const retryReadyAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    await Promise.all(needsRetry.map(r =>
      admin.from('scrape_dispatch_queue')
        .update({ dispatched_at: null, ready_at: retryReadyAt, retry_count: r.retryCount + 1 })
        .eq('game_pk', r.gamePk)
    ))
  }

  return NextResponse.json({
    ok: true,
    dispatched: toScrape.length,
    skippedAlreadyLive: live.map(r => r.game_pk),
    gamePks: toScrape.map(r => r.game_pk),
    retryQueued: needsRetry.map(r => ({ gamePk: r.gamePk, missing: r.stillMissing })),
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? String(r.reason) }),
  })
}
