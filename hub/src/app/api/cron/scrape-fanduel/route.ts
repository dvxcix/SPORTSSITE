import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { runFanduelScrape } from '@/lib/scrapers/fanduelScraper'
import { findAndClickGame, legIndexFor } from '@/lib/scrapers/gameMatch'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/platform'
import { addDaysToDateStr } from '@/lib/balldontlie'
import { missingMarkets } from '@/lib/scrapers/retryMarkets'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 300
export const GET = withPipelineHealth('scrape-fanduel', run, { allowSecondarySecret: true })

// Automates the exact manual workflow: sportsbook.fanduel.com/navigation/mlb
// -> "GAMES" tab -> click into a specific game -> run the all-tabs scraper
// (fanduelScraper.ts handles clicking through every non-skipped market tab
// itself) -> POST the result to fanduel-import, which auto-detects the real
// game from each scrape's own event.title (see that route's
// detectGameFromTitle) so an imprecise listing-page click still lands under
// the right game_key.
//
// Called two ways:
//   ?gamePk=123   -> scrapes just that one game, one Browserbase session.
//   (no gamePk)   -> "sweep" mode: fans out one concurrent request per
//                    today's game back to this same route instead of
//                    looping in-process — wall time is bounded by the
//                    slowest single game, not the sum of every game, which
//                    is what let a full slate blow past the time budget
//                    when it all ran sequentially in one loop.
async function postImport(json: unknown, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const scrapes = Array.isArray(json) ? json : [json]
  const batches: unknown[][] = []
  let current: unknown[] = []
  const maxBatchBytes = 2_000_000

  // Visiting every tab can exceed a serverless request-body limit on a deep
  // event. Chunk by encoded size without splitting a tab, then merge the
  // importer summaries so the existing missing-market retry still works.
  for (const scrape of scrapes) {
    const candidate = [...current, scrape]
    const bytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength
    if (current.length && bytes > maxBatchBytes) {
      batches.push(current)
      current = [scrape]
    } else {
      current = candidate
    }
  }
  if (current.length) batches.push(current)

  const results = await Promise.all(batches.map(async batch => {
    const res = await fetch(`${PLATFORM_URL}/api/admin/fanduel-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ json: batch, gameDate, homeTeam, awayTeam, gameKey, isOpening: true }),
      signal: AbortSignal.timeout(45_000),
    })
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
  }))

  const marketSummary: Record<string, number> = {}
  for (const result of results) {
    for (const [market, count] of Object.entries(result.body?.marketSummary ?? {})) {
      if (typeof count === 'number') marketSummary[market] = (marketSummary[market] ?? 0) + count
    }
  }
  const failed = results.find(result => !result.ok)
  return {
    ok: !failed,
    status: failed?.status ?? 200,
    body: {
      ok: !failed,
      batches: batches.length,
      marketSummary,
      rowsImported: results.reduce((sum, result) => sum + (result.body?.rowsImported ?? 0), 0),
      rawTabsArchived: results.reduce((sum, result) => sum + (result.body?.rawTabsArchived ?? 0), 0),
      rawOutcomesArchived: results.reduce((sum, result) => sum + (result.body?.rawOutcomesArchived ?? 0), 0),
      errors: results.filter(result => !result.ok).map(result => result.body?.error ?? `HTTP ${result.status}`),
    },
  }
}

async function scrapeOneGameAttempt(g: TodayGame, date: string, legIdx: number, dryRun: boolean) {
  const bb = await openSession({ metadata: { book: 'fanduel', gameKey: g.gameKey, gamePk: String(g.gamePk) } })
  try {
    await bb.page.goto('https://sportsbook.fanduel.com/navigation/mlb', { waitUntil: 'domcontentloaded' })
    // Best-effort — harmless no-op if "GAMES" is already the active tab.
    await bb.page.getByText('GAMES', { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
    await bb.page.waitForTimeout(1500)

    // The listing SPA can still be rendering game cards after
    // domcontentloaded — a miss here doesn't necessarily mean the game
    // isn't listed, just that the search ran too early. One retry after a
    // longer wait catches that without slowing down the common case.
    let clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    if (!clicked) {
      await bb.page.waitForTimeout(3000)
      clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    }
    if (!clicked) return { gameKey: g.gameKey, error: 'game link not found on FD listing page' }
    await bb.page.waitForTimeout(2500)

    const scrapes = await bb.page.evaluate(runFanduelScrape)
    if (!scrapes.length) return { gameKey: g.gameKey, error: 'no tabs scraped' }

    // Labels only, no prices or member data. This makes a sportsbook copy or
    // tab-placement change diagnosable from production logs instead of
    // presenting as a mysteriously empty database column.
    const discoveryLabels = Array.from(new Set(scrapes.flatMap(scrape => [
      ...Object.keys(scrape.sections ?? {}),
      ...(Object.values(scrape.sections ?? {}) as Array<Array<{ market_hint?: string | null }>>).flatMap(outcomes =>
        Array.isArray(outcomes) ? outcomes.map(outcome => outcome?.market_hint).filter(Boolean) : []),
    ]))).filter(label => /home\s*run|plate\s+appearance|\b(?:first|1st)\s+pa\b/i.test(String(label)))
    console.info('[scrape-fanduel] market discovery', {
      gameKey: g.gameKey,
      tabs: scrapes.map(scrape => scrape.active_tab?.label).filter(Boolean),
      labels: discoveryLabels.slice(0, 100),
    })

    if (dryRun) return { gameKey: g.gameKey, tabsScraped: scrapes.length, dryRun: true, scrapes }

    const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, tabsScraped: scrapes.length, imported }
  } catch {
    return { gameKey: g.gameKey, error: 'scrape failed' }
  } finally {
    await bb.close()
  }
}

// Real gap (2026-07-25): fanduelScraper.ts's per-tab section-expand/match
// can silently drop a whole market group with no error while every other
// market on the same page succeeds (see that file's own comments) — one
// scrape attempt had no way to know. dispatch-scrapes' own 5-minute-later
// retry only reacts to ITS queue, so it never fires for a manual direct
// hit on this route (confirmed live: a member's manual re-trigger for a
// missed lineup-confirm window reproduced the exact same gap). Moving the
// self-check + retry HERE instead means every caller — the automated
// dispatcher, the 2-hour sweep, AND a manual gamePk hit — gets the same
// one-retry safety net, no queue required. A fresh Browserbase session on
// the retry (not the same page) since whatever DOM state caused the miss
// shouldn't be trusted to have cleared on its own.
async function scrapeOneGame(g: TodayGame, date: string, legIdx: number, dryRun: boolean) {
  const first = await scrapeOneGameAttempt(g, date, legIdx, dryRun)
  if (dryRun || 'error' in first) return first
  const missing = missingMarkets(first.imported?.body?.marketSummary ?? {})
  if (!missing.length) return first

  const retry = await scrapeOneGameAttempt(g, date, legIdx, dryRun)
  if ('error' in retry) return { ...first, retriedFor: missing, retryError: retry.error }
  const stillMissing = missingMarkets(retry.imported?.body?.marketSummary ?? {})
  return { ...retry, retriedFor: missing, stillMissing: stillMissing.length ? stillMissing : undefined }
}

async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  // Resolved once per sweep and threaded through every fanned-out
  // sub-request below (as its own explicit ?date=) instead of letting each
  // one independently re-derive "today" from wall-clock time — a sweep that
  // starts before midnight ET and fans out after it used to have
  // sub-requests silently resolve a DIFFERENT day, 404-ing on a gamePk that
  // wasn't in the newly-recomputed day's slate. ?dayAhead=1 is how the
  // static vercel.json cron schedule reaches "tomorrow" (it can't compute
  // that itself), while ?date= (used only by our own fan-out) always wins
  // once already resolved.
  const dayAhead = url.searchParams.get('dayAhead') === '1'
  const date = url.searchParams.get('date') || (dayAhead ? addDaysToDateStr(todayEt, 1) : todayEt)
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })
  // The archive is pregame-only. The scheduled intraday sweep used to keep
  // every game on the date in scope even after first pitch; any live page
  // FanDuel still exposed could therefore leak live prices into what should
  // be opening/closing history. Freeze eligibility at the schedule status.
  const pregameGames = games.filter(game => isPregame(game.status))
  const skippedAlreadyLive = games
    .filter(game => !isPregame(game.status))
    .map(game => game.gameKey)

  // Real incident (2026-08-07/08): findAndClickGame matches purely on team
  // NAME, with zero date awareness — legIndexFor only disambiguates a same-
  // day doubleheader (game 1 vs game 2), never "which day" for a team pair
  // that's simply playing on consecutive days (an ordinary continuing
  // series, extremely common in MLB). For a future-dated scrape (this route
  // called with a date past real "today," whether via ?dayAhead=1 at the
  // top or the resolved ?date= on a fanned-out per-game sub-request), if the
  // SAME two teams also have a game listed for TODAY, FanDuel's own GAMES
  // tab can show both under matching team names — legIndex 0 (the default
  // for a non-doubleheader) then has no way to tell which listing is
  // actually tomorrow's, and a click can land on today's already-live/
  // confirmed game instead. That produces real, correctly-priced FanDuel
  // odds that get imported and stamped with TOMORROW's date anyway —
  // confirmed live: ATL@NYY's "tomorrow" FHR odds turned out to be today's
  // real game's odds, re-scraped a bit later than the same-day pass and
  // showing normal in-market line movement, not literally identical numbers
  // (which is what made it look plausible instead of obviously wrong).
  // Skipping any ambiguous team-pair here — rather than trying to guess
  // which listing is which without ever having inspected FanDuel's real DOM
  // for this case — costs one day's early line for that specific matchup;
  // the regular same-day scrape still covers it correctly once it's
  // actually "today."
  const isFutureDate = date > todayEt
  let skippedAmbiguous: string[] = []
  let effectiveGames = pregameGames
  if (isFutureDate) {
    const todaysGames = await getTodaysMatchups(todayEt)
    const todaysPairs = new Set(todaysGames.map(g => `${g.awayTeamId}@${g.homeTeamId}`))
    const ambiguous = pregameGames.filter(g => todaysPairs.has(`${g.awayTeamId}@${g.homeTeamId}`))
    skippedAmbiguous = ambiguous.map(g => g.gameKey)
    effectiveGames = pregameGames.filter(g => !todaysPairs.has(`${g.awayTeamId}@${g.homeTeamId}`))
  }

  const gamePkParam = url.searchParams.get('gamePk')
  const dryRun = url.searchParams.get('dryRun') === '1'
  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in ${date}'s matchups` }, { status: 404 })
    if (!isPregame(g.status)) {
      return NextResponse.json({ date, gamePk, skipped: 'game already started; FanDuel archive is pregame-only' })
    }
    if (!effectiveGames.includes(g)) {
      return NextResponse.json({ date, gamePk, skipped: 'ambiguous team pair also plays today — see route.ts comment' })
    }
    const result = await scrapeOneGame(g, date, legIndexFor(g), dryRun)
    return NextResponse.json({ date, gamePk, result })
  }

  if (!effectiveGames.length) return NextResponse.json({ date, games: games.length, skippedAlreadyLive, skippedAmbiguous, results: [] })
  const extraQuery = `&date=${date}${dryRun ? '&dryRun=1' : ''}`
  const results = await fanOutToSelf('/api/cron/scrape-fanduel', effectiveGames.map(g => g.gamePk), extraQuery)
  return NextResponse.json({ date, games: games.length, skippedAlreadyLive, skippedAmbiguous, results })
}
