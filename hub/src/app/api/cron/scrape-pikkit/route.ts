import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { openPikkitSession, type BBSession } from '@/lib/browserbase'
import { runPikkitScrape } from '@/lib/scrapers/pikkitScraper'
import { findAndClickPikkitGame, legIndexFor, clickTabByText, escapeRe, distinguishingSuffix } from '@/lib/scrapers/gameMatch'
import { PLATFORM_URL } from '@/lib/platform'
import { PIKKIT_SIGNED_OUT_ERROR } from '@/lib/scrapers/pikkitAuth'
import { summarizePikkitPayload } from '@/lib/pikkitCoverage'
import { acquirePikkitBrowserLease } from '@/lib/pikkitBrowserLease'

export const revalidate = 0
export const maxDuration = 300

// Automates: app.pikkit.com/leagues/mlb -> click into a specific game ->
// the event page's "Odds" header tab -> "Batting Props" sub-tab ->
// runPikkitScrape() (walks the market <select>, same as the manual
// bookmarklet) -> POST to pikkit-import. Runs against a PERSISTED
// Browserbase context (PIKKIT_CONTEXT_ID) since this is the one site of
// the three that requires being signed in — see /api/admin/pikkit-context
// for the one-time login setup that produces that context id.
//
// Single-game calls remain available for diagnostics. Scheduled and manual
// slate sweeps use four-game batches so several event pages share one paid
// browser/proxy minimum.
async function postImport(json: unknown, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/pikkit-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey }),
    signal: AbortSignal.timeout(45_000),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

async function installTextOnlyRouting(bb: BBSession) {
  await bb.page.route('**/*', route => {
    const type = route.request().resourceType()
    return type === 'image' || type === 'media' || type === 'font' ? route.abort() : route.continue()
  })
}

async function scrapeOneGame(g: TodayGame, date: string, legIdx: number, contextId: string, dryRun: boolean, shared?: BBSession) {
  const bb = shared ?? await openPikkitSession(contextId, { sport: 'mlb', mode: 'single-game', gameKey: g.gameKey, gamePk: String(g.gamePk) })
  try {
    // Pikkit scraping is pure text/DOM extraction (team names, a market
    // <select>, pick counts) — no visual rendering is ever needed, and
    // unlike FD/MGM this isn't a bot-detection-sensitive site (we're
    // already signed in via a persisted context), so blocking images is
    // low-risk here specifically. Per Browserbase's own cost-optimization
    // guidance, this cuts proxy bandwidth without touching page behavior.
    if (!shared) await installTextOnlyRouting(bb)
    // Confirmed live: this click can land on the WRONG game's event page -
    // a debug dump for a game reporting "no markets scraped" (CWS@TEX)
    // showed a completely unrelated matchup (Orioles @ Red Sox) instead,
    // most likely findAndClickPikkitGame's "nearest following More wagers
    // link" xpath skipping past this game's own row (e.g. a still-pregame
    // game not showing that link yet) and landing on some other game's.
    // Scraping+importing whatever markets happen to be on that wrong page
    // would silently mislabel a different game's real prop picks as this
    // one's — a real data-integrity risk, not just a missed scrape. Verify
    // both teams actually appear on the page before trusting anything
    // scraped from it.
    // Confirmed live: the Batting Props click failed consistently across 2 real attempts
    // even after the retry-for-timing fix, unlike Odds — reads as an exact-
    // text-match miss (clickTabByText defaults to exact), not a timing
    // issue. Pikkit likely renders something alongside the label itself
    // (a count badge, icon text) that breaks an exact match. Non-exact
    // (substring) match instead, still with one retry for genuine timing.
    let scrape: Awaited<ReturnType<typeof runPikkitScrape>> | null = null
    let stage = 'listing'
    let oddsClicked = false
    let propsClicked = false
    let lastReason = ''
    for (let attempt = 1; attempt <= 2; attempt++) {
      stage = 'listing'
      await bb.page.goto('https://app.pikkit.com/leagues/mlb', { waitUntil: 'domcontentloaded' })
      await bb.page.waitForTimeout(attempt === 1 ? 1500 : 3000)
      const clicked = await findAndClickPikkitGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
      if (!clicked) {
        const listingState = await bb.page.evaluate(({ away, home }) => {
          const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, [role="link"], [role="button"]'))
          return {
            url: location.href,
            hasYourBets: (document.body?.innerText || '').includes('Your Bets'),
            hasAwayTeam: (document.body?.innerText || '').toLowerCase().includes(away.toLowerCase()),
            hasHomeTeam: (document.body?.innerText || '').toLowerCase().includes(home.toLowerCase()),
            controlCount: controls.length,
            controlLabels: controls.map(control => (control.innerText || control.getAttribute('aria-label') || '').trim())
              .filter(Boolean).slice(0, 40),
          }
        }, { away: distinguishingSuffix(g.awayTeam), home: distinguishingSuffix(g.homeTeam) }).catch(() => null)
        console.warn('[scrape-pikkit] listing match failed', { gameKey: g.gameKey, attempt, listingState })
        lastReason = `game link not found on Pikkit MLB listing page - ${PIKKIT_SIGNED_OUT_ERROR}`
        continue
      }

      stage = 'event-page'
      await bb.page.waitForTimeout(3000)
      const awayWord = escapeRe(distinguishingSuffix(g.awayTeam))
      const homeWord = escapeRe(distinguishingSuffix(g.homeTeam))
      const landedText = await bb.page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      if (!new RegExp(awayWord, 'i').test(landedText) || !new RegExp(homeWord, 'i').test(landedText)) {
        lastReason = 'landed on the wrong game page - expected teams not found'
        continue
      }

      stage = 'odds-tab'
      oddsClicked = await clickTabByText(bb.page, 'Odds')
      if (!oddsClicked) {
        await bb.page.waitForTimeout(2000)
        oddsClicked = await clickTabByText(bb.page, 'Odds')
      }
      await bb.page.waitForTimeout(1500)

      stage = 'batting-props-tab'
      propsClicked = await clickTabByText(bb.page, 'Batting Props', false)
      if (!propsClicked) {
        await bb.page.waitForTimeout(2000)
        propsClicked = await clickTabByText(bb.page, 'Batting Props', false)
      }
      await bb.page.waitForTimeout(1200)

      stage = 'extract'
      scrape = await bb.page.evaluate(runPikkitScrape)
      if (Object.keys(scrape.props).length) break
      lastReason = 'no markets scraped'
      scrape = null
    }
    if (!scrape) return {
      gameKey: g.gameKey,
      skipped: lastReason.startsWith('game link not found'),
      error: lastReason || 'no markets scraped',
      stage,
      attempts: 2,
      oddsTabFound: oddsClicked,
      battingPropsTabFound: propsClicked,
    }

    const coverage = summarizePikkitPayload(scrape)
    const marketCount = coverage.marketCount

    if (dryRun) return { gameKey: g.gameKey, marketsScraped: marketCount, coverage, dryRun: true, scrape }

    const imported = await postImport(scrape, date, g.homeTeam, g.awayTeam, g.gameKey)
    if (!imported.ok) {
      console.error('[scrape-pikkit] import failed', {
        gameKey: g.gameKey,
        status: imported.status,
        marketsScraped: marketCount,
      })
      return { gameKey: g.gameKey, marketsScraped: marketCount, coverage, error: 'pick import failed', imported }
    }
    return { gameKey: g.gameKey, marketsScraped: marketCount, coverage, partial: !coverage.complete, imported }
  } catch (error) {
    console.error('[scrape-pikkit] scrape failed', {
      gameKey: g.gameKey,
      type: error instanceof Error ? error.name : typeof error,
    })
    return { gameKey: g.gameKey, error: error instanceof Error ? `scrape failed: ${error.message.slice(0, 300)}` : 'scrape failed' }
  } finally {
    if (!shared) await bb.close()
  }
}

async function scrapeBatch(games: TodayGame[], date: string, contextId: string, dryRun: boolean) {
  const bb = await openPikkitSession(contextId, {
    sport: 'mlb',
    mode: 'batch',
    gameCount: games.length,
    gamePks: games.map(game => game.gamePk).join(','),
  })
  try {
    const results: Awaited<ReturnType<typeof scrapeOneGame>>[] = []
    // Several isolated pages share one remote browser/session minimum. Four
    // at a time keeps memory bounded while preserving one result per game.
    for (let index = 0; index < games.length; index += 4) {
      const group = games.slice(index, index + 4)
      const pages = await Promise.all(group.map((_, pageIndex) => (
        index === 0 && pageIndex === 0 ? Promise.resolve(bb.page) : bb.page.context().newPage()
      )))
      await Promise.all(pages.map(page => installTextOnlyRouting({ ...bb, page })))
      results.push(...await Promise.all(group.map((game, gameIndex) => scrapeOneGame(
        game,
        date,
        legIndexFor(game),
        contextId,
        dryRun,
        { ...bb, page: pages[gameIndex] },
      ))))
      await Promise.all(pages.filter(page => page !== bb.page).map(page => page.close().catch(() => {})))
    }
    return results
  } finally {
    await bb.close()
  }
}

async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const contextId = process.env.PIKKIT_CONTEXT_ID
  if (!contextId) {
    return NextResponse.json({ error: 'PIKKIT_CONTEXT_ID is not configured — run the one-time login setup first (GET /api/admin/pikkit-context while signed in as admin)' }, { status: 500 })
  }

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const reqUrl = new URL(req.url)
  const gamePkParam = reqUrl.searchParams.get('gamePk')
  const gamePksParam = reqUrl.searchParams.get('gamePks')
  const dryRun = reqUrl.searchParams.get('dryRun') === '1'
  if (gamePksParam) {
    const requested = new Set(gamePksParam.split(',').map(Number).filter(Number.isFinite).slice(0, 40))
    const selected = games.filter(game => requested.has(game.gamePk))
    if (!selected.length) return NextResponse.json({ error: 'No requested games found' }, { status: 404 })
    const results = await scrapeBatch(selected, date, contextId, dryRun)
    const failed = results.filter(result => 'error' in result)
    return NextResponse.json({ date, games: selected.length, failed: failed.length, results }, { status: failed.length ? 502 : 200 })
  }
  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in today's matchups` }, { status: 404 })
    const result = await scrapeOneGame(g, date, legIndexFor(g), contextId, dryRun)
    const failed = ('error' in result && !('skipped' in result && result.skipped))
      || ('imported' in result && result.imported?.ok === false)
    return NextResponse.json({ date, gamePk, result }, { status: failed ? 502 : 200 })
  }

  // One persisted Pikkit Context must never back simultaneous Browserbase
  // sessions. scrapeBatch already bounds work to four concurrent pages
  // inside ONE browser; opening one session per four-game chunk here caused
  // Pikkit to see several concurrent logins and invalidate the account.
  const results = await scrapeBatch(games, date, contextId, dryRun)

  const failed = results.filter(result => ('error' in result && !('skipped' in result && result.skipped)) || ('imported' in result && result.imported?.ok === false))
  return NextResponse.json({ date, games: games.length, failed: failed.length, results }, { status: failed.length ? 502 : 200 })
}

export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError
  const lease = await acquirePikkitBrowserLease()
  if (!lease) {
    return NextResponse.json({ error: 'Pikkit persisted context is already in use; retry after the current capture finishes' }, { status: 423 })
  }
  try {
    return await run(req)
  } finally {
    await lease.release()
  }
}
