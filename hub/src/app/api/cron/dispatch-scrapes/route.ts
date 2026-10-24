import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame } from '@slipsurge/core/mlbSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import { missingOpeningMarkets } from '@/lib/scrapers/retryMarkets'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'

export const revalidate = 0
export const maxDuration = 360
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
// FanDuel plus one definitive Pikkit capture. Baseline Pikkit reads are now
// sparse; confirmed lineups define the real player universe, so this event
// supplies the final pick checkpoint without blind 30-minute polling.
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
// A failed/partial capture or missing opening markets earns one delayed
// sportsbook retry. It never repeats a completed public-count checkpoint.
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

  const headers = { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  // FanDuel's delayed missing-market retry must not duplicate the already
  // successful lineup pick capture. A real later lineup change resets the
  // queue retry_count to zero and correctly earns one replacement capture.
  const pikkitRows = toScrape.filter(row => row.retry_count === 0)
  const pikkitPromise = pikkitRows.length
    ? fetch(`${PLATFORM_URL}/api/cron/scrape-pikkit?gamePks=${pikkitRows.map(row => row.game_pk).join(',')}`, {
        headers,
        signal: AbortSignal.timeout(260_000),
      }).then(async response => {
        const body = await response.json().catch(() => null)
        const captured = response.ok && body?.failed === 0 && Array.isArray(body.results) && body.results.length === pikkitRows.length
          && body.results.every((result: { error?: string; partial?: boolean; imported?: { ok?: boolean } }) => !result.error && !result.partial && result.imported?.ok === true)
        return { status: response.status, ok: captured, body }
      })
      .catch(() => ({ status: 502, ok: false, body: null }))
    : Promise.resolve({ status: 200, ok: true, body: null })

  const [results, pikkit] = await Promise.all([Promise.all(
    toScrape.map(async row => {
      try {
        const res = await fetch(`${PLATFORM_URL}/api/cron/scrape-fanduel?gamePk=${row.game_pk}`, {
          headers,
          // Outlive the existing 300s child route, while leaving time for
          // queue updates and a response within this dispatcher's 360s cap.
          signal: AbortSignal.timeout(330_000),
        })
        const body = await res.json().catch(() => null)
        const skipped = res.ok && typeof body?.skipped === 'string'
        const capture = body?.result
        const ok = skipped || (res.ok && !capture?.error && capture?.imported?.ok === true)
        const stillMissing = skipped ? [] : missingOpeningMarkets(capture?.imported?.body?.marketSummary ?? {})
        return { gamePk: row.game_pk, status: res.status, ok, skipped, stillMissing, retryCount: row.retry_count,
          ...(!ok ? { error: 'FanDuel capture failed or incomplete' } : {}) }
      } catch {
        return { gamePk: row.game_pk, status: 502, ok: false, skipped: false, stillMissing: [] as string[], retryCount: row.retry_count, error: 'FanDuel capture response unavailable' }
      }
    })
  ), pikkitPromise])

  const retryCandidates = results.filter(r => !r.skipped && r.retryCount < 1 && (!r.ok || r.stillMissing.length > 0))
  const retryQueued: { gamePk: number; missing: string[] }[] = []
  const retryFailed: number[] = []
  if (retryCandidates.length) {
    // Extraction may take several minutes. Recheck eligibility before
    // enqueueing; the next dispatch also checks again before any capture.
    const latest = await getTodaysMatchups(date)
    const pregameIds = new Set(latest.filter(game => isPregame(game.status)).map(game => game.gamePk))
    const retryReadyAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    await Promise.all(retryCandidates.filter(r => pregameIds.has(r.gamePk)).map(async r => {
      const queued = await admin.from('scrape_dispatch_queue')
        .update({ dispatched_at: null, ready_at: retryReadyAt, retry_count: r.retryCount + 1 })
        .eq('game_pk', r.gamePk)
        .eq('retry_count', r.retryCount)
        .eq('dispatched_at', nowIso)
        .select('game_pk')
      if (queued.error) retryFailed.push(r.gamePk)
      else if (queued.data?.length) retryQueued.push({ gamePk: r.gamePk, missing: r.stillMissing })
    }))
  }

  const ok = pikkit.ok && results.every(result => result.ok && !result.stillMissing.length) && !retryFailed.length
  return NextResponse.json({
    ok,
    dispatched: toScrape.length,
    skippedAlreadyLive: live.map(r => r.game_pk),
    gamePks: toScrape.map(r => r.game_pk),
    retryQueued,
    retryFailed,
    pikkit: { ok: pikkit.ok, status: pikkit.status, games: pikkitRows.length },
    results,
  }, { status: ok ? 200 : 502 })
}
