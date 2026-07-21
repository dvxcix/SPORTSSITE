import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, type TodayGame } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { runPikkitScrape } from '@/lib/scrapers/pikkitScraper'
import { findAndClickPikkitGame, legIndexFor, clickTabByText, escapeRe, distinguishingSuffix } from '@/lib/scrapers/gameMatch'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/stripe'
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
// Called two ways: ?gamePk=123 scrapes just that game; no gamePk fans out
// one concurrent request per today's game back to this same route instead
// of looping in-process (see fanOutToSelf). Every concurrent invocation
// resumes the SAME persisted login context — unverified whether Pikkit's
// own backend tolerates multiple simultaneous sessions on one signed-in
// account cleanly; watch the first real multi-game day's Browserbase
// replays for unexpected logouts before trusting this at full concurrency.
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/pikkit-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey }),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

async function scrapeOneGame(g: TodayGame, date: string, legIdx: number, contextId: string, dryRun: boolean, debug = false) {
  const bb = await openSession({ contextId, metadata: { book: 'pikkit', gameKey: g.gameKey, gamePk: String(g.gamePk) } })
  try {
    // Pikkit scraping is pure text/DOM extraction (team names, a market
    // <select>, pick counts) — no visual rendering is ever needed, and
    // unlike FD/MGM this isn't a bot-detection-sensitive site (we're
    // already signed in via a persisted context), so blocking images is
    // low-risk here specifically. Per Browserbase's own cost-optimization
    // guidance, this cuts proxy bandwidth without touching page behavior.
    await bb.page.route('**/*', route =>
      route.request().resourceType() === 'image' ? route.abort() : route.continue()
    )
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
    if (!clicked) return { gameKey: g.gameKey, error: `game link not found on Pikkit MLB listing page — ${PIKKIT_SIGNED_OUT_ERROR}` }
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
        ...(debug ? { landedOnSnippet: landedText.slice(0, 300) } : {}),
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
      const pageText = debug
        ? await bb.page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '').catch(() => null)
        : undefined
      return { gameKey: g.gameKey, error: 'no markets scraped', oddsTabFound: oddsClicked, battingPropsTabFound: propsClicked, ...(debug ? { pageText } : {}) }
    }

    if (dryRun) return { gameKey: g.gameKey, marketsScraped: marketCount, dryRun: true, scrape }

    const imported = await postImport(scrape, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, marketsScraped: marketCount, imported }
  } catch (e: any) {
    return { gameKey: g.gameKey, error: e?.message ?? String(e) }
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
  const dryRun = reqUrl.searchParams.get('dryRun') === '1'
  const debug = reqUrl.searchParams.get('debug') === '1'
  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in today's matchups` }, { status: 404 })
    const result = await scrapeOneGame(g, date, legIndexFor(g), contextId, dryRun, debug)
    return NextResponse.json({ date, gamePk, result })
  }

  const results = await fanOutToSelf('/api/cron/scrape-pikkit', games.map(g => g.gamePk), dryRun ? '&dryRun=1' : '')

  // Every game in the sweep hitting the exact same "not found" error is the
  // strong signal (one game missing a listing is normal noise; ALL of them
  // failing identically isn't) — worth spending one extra Browserbase
  // session to confirm directly whether that's a real sign-out. See
  // pikkitAuth.ts for why this can't just trust the error string alone.
  const allSignedOutError = results.length > 0 && results.every(r => r.body?.result?.error === `game link not found on Pikkit MLB listing page — ${PIKKIT_SIGNED_OUT_ERROR}`)
  if (allSignedOutError) {
    await checkPikkitAuthAndAlert(contextId).catch(e => console.error('[scrape-pikkit] auth alert check failed', e))
  }

  return NextResponse.json({ date, games: games.length, results })
}
