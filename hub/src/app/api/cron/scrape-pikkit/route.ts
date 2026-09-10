import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { openPikkitSession, type BBSession } from '@/lib/browserbase'
import { runPikkitScrape } from '@/lib/scrapers/pikkitScraper'
import { findAndClickPikkitGame, legIndexFor, clickTabByText, escapeRe, distinguishingSuffix } from '@/lib/scrapers/gameMatch'
import { PLATFORM_URL } from '@/lib/platform'
import { PIKKIT_SIGNED_OUT_ERROR, checkPikkitAuthAndAlert } from '@/lib/scrapers/pikkitAuth'

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
  const bb = shared ?? await openPikkitSession(contextId, { mode: 'scrape', gameKey: g.gameKey, gamePk: String(g.gamePk) })
  try {
    // Pikkit scraping is pure text/DOM extraction (team names, a market
    // <select>, pick counts) — no visual rendering is ever needed, and
    // unlike FD/MGM this isn't a bot-detection-sensitive site (we're
    // already signed in via a persisted context), so blocking images is
    // low-risk here specifically. Per Browserbase's own cost-optimization
    // guidance, this cuts proxy bandwidth without touching page behavior.
    if (!shared) await installTextOnlyRouting(bb)
    await bb.page.goto('https://app.pikkit.com/leagues/mlb', { waitUntil: 'domcontentloaded' })
    await bb.page.waitForTimeout(1500)

    // Pikkit's schedule list is row-per-team, not one element with both
    // team names like FD/MGM — findAndClickPikkitGame locates the away
    // team's row then clicks the nearest following "More wagers" link.
    let clicked = await findAndClickPikkitGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    if (!clicked) {
      await bb.page.waitForTimeout(3000)
      clicked = await findAndClickPikkitGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    }
    if (!clicked) return { gameKey: g.gameKey, skipped: true, error: `game link not found on Pikkit MLB listing page — ${PIKKIT_SIGNED_OUT_ERROR}` }
    // "More wagers" navigates to a whole new page (the game's event page),
    // not just an in-place DOM update — give it real time to load.
    await bb.page.waitForTimeout(3000)

    // Confirmed live: this click can land on the WRONG game's event page —
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
    const awayWord = escapeRe(distinguishingSuffix(g.awayTeam))
    const homeWord = escapeRe(distinguishingSuffix(g.homeTeam))
    const landedText = await bb.page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
    if (!new RegExp(awayWord, 'i').test(landedText) || !new RegExp(homeWord, 'i').test(landedText)) {
      return {
        gameKey: g.gameKey,
        error: 'landed on the wrong game page after clicking "More wagers" on the Pikkit listing — expected teams not found',
      }
    }

    let oddsClicked = await clickTabByText(bb.page, 'Odds')
    if (!oddsClicked) {
      await bb.page.waitForTimeout(2500)
      oddsClicked = await clickTabByText(bb.page, 'Odds')
    }
    await bb.page.waitForTimeout(2000)

    // Confirmed live: this one failed consistently across 2 real attempts
    // even after the retry-for-timing fix, unlike Odds — reads as an exact-
    // text-match miss (clickTabByText defaults to exact), not a timing
    // issue. Pikkit likely renders something alongside the label itself
    // (a count badge, icon text) that breaks an exact match. Non-exact
    // (substring) match instead, still with one retry for genuine timing.
    let propsClicked = await clickTabByText(bb.page, 'Batting Props', false)
    if (!propsClicked) {
      await bb.page.waitForTimeout(2500)
      propsClicked = await clickTabByText(bb.page, 'Batting Props', false)
    }
    await bb.page.waitForTimeout(1500)

    let scrape = await bb.page.evaluate(runPikkitScrape)
    let marketCount = Object.keys(scrape.props).length
    if (!marketCount) {
      await bb.page.waitForTimeout(3000)
      scrape = await bb.page.evaluate(runPikkitScrape)
      marketCount = Object.keys(scrape.props).length
    }
    if (!marketCount) {
      // Diagnostic only, opt-in via ?debug=1 — dumps the actual page text at
      // the point of failure instead of guessing why the Batting Props tab
      // wasn't found (Pikkit renaming/restructuring the tab vs. it genuinely
      // not existing yet for this game look identical from the outside
      // otherwise). Not run on every cron invocation — this is extra page
      // read time on top of an already long scrape.
      return { gameKey: g.gameKey, skipped: true, error: 'no markets scraped', oddsTabFound: oddsClicked, battingPropsTabFound: propsClicked }
    }

    if (dryRun) return { gameKey: g.gameKey, marketsScraped: marketCount, dryRun: true, scrape }

    const imported = await postImport(scrape, date, g.homeTeam, g.awayTeam, g.gameKey)
    if (!imported.ok) {
      console.error('[scrape-pikkit] import failed', {
        gameKey: g.gameKey,
        status: imported.status,
        marketsScraped: marketCount,
      })
      return { gameKey: g.gameKey, marketsScraped: marketCount, error: 'pick import failed', imported }
    }
    return { gameKey: g.gameKey, marketsScraped: marketCount, imported }
  } catch (error) {
    console.error('[scrape-pikkit] scrape failed', {
      gameKey: g.gameKey,
      type: error instanceof Error ? error.name : typeof error,
    })
    return { gameKey: g.gameKey, error: 'scrape failed' }
  } finally {
    if (!shared) await bb.close()
  }
}

async function scrapeBatch(games: TodayGame[], date: string, contextId: string, dryRun: boolean) {
  const bb = await openPikkitSession(contextId, {
    mode: 'scrape-batch',
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

export async function GET(req: Request) {
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
    return NextResponse.json({ date, games: selected.length, results })
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

  const batches: TodayGame[][] = []
  for (let index = 0; index < games.length; index += 4) batches.push(games.slice(index, index + 4))
  const results = (await Promise.all(batches.map(batch => scrapeBatch(batch, date, contextId, dryRun)))).flat()

  // Every game in the sweep hitting the exact same "not found" error is the
  // strong signal (one game missing a listing is normal noise; ALL of them
  // failing identically isn't) — worth spending one extra Browserbase
  // session to confirm directly whether that's a real sign-out. See
  // pikkitAuth.ts for why this can't just trust the error string alone.
  const allSignedOutError = results.length > 0 && results.every(result => result.error === `game link not found on Pikkit MLB listing page - ${PIKKIT_SIGNED_OUT_ERROR}`)
  if (allSignedOutError) {
    await checkPikkitAuthAndAlert(contextId).catch(e => console.error('[scrape-pikkit] auth alert check failed', { type: e instanceof Error ? e.name : typeof e }))
  }

  const failed = results.filter(result => ('error' in result && !('skipped' in result && result.skipped)) || ('imported' in result && result.imported?.ok === false))
  return NextResponse.json({ date, games: games.length, failed: failed.length, results }, { status: failed.length ? 502 : 200 })
}
