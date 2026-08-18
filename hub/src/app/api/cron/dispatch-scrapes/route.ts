import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame } from '@slipsurge/core/mlbSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import { missingOpeningMarkets } from '@/lib/scrapers/retryMarkets'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'

export const revalidate = 0
export const maxDuration = 280
export const GET = withPipelineHealth('dispatch-scrapes', run)

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
// Some FanDuel tabs can silently miss even when the rest of the event is
// healthy. scrape-fanduel performs one immediate retry only for core markets
// that should exist on every complete event. This dispatcher adds a single
// delayed retry for those core markets plus FHR, which may simply not have
// been posted at the first lineup-triggered capture. Optional or discontinued
// markets never trigger a full-event retry. See lib/scrapers/retryMarkets.ts.
async function run(req: Request) {
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

  if (error) return safeApiError('dispatch-scrapes-claim', error)
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
        signal: AbortSignal.timeout(55_000),
      })
      const body = await res.json().catch(() => null)
      // The same-request retry only checks markets that must exist on every
      // healthy event. The delayed opening retry has one additional concern:
      // FHR may not have been posted yet. Always derive this queue's decision
      // from the FINAL capture so a surviving core-market miss cannot mask a
      // simultaneously absent FHR market.
      const stillMissing = missingOpeningMarkets(body?.result?.imported?.body?.marketSummary ?? {})
      return { gamePk: row.game_pk, status: res.status, stillMissing, retryCount: row.retry_count }
    })
  )

  const fulfilled = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])

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
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: 'dispatch failed' }),
  })
}
