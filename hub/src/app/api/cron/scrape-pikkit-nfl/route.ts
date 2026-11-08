import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { openPikkitSession, type BBSession } from '@/lib/browserbase'
import { nflRecoveryReservation } from '@/lib/nflNov8BrowserRecovery'
import { BrowserbaseAdmissionError } from '@/lib/browserbaseAdmissionError'
import { PLATFORM_URL } from '@/lib/platform'
import { getUpcomingNflPikkitGames, type NflPikkitScheduleGame } from '@/lib/nflPikkitSchedule'
import { runPikkitScrape } from '@/lib/scrapers/pikkitScraper'
import { clickTabByText, distinguishingSuffix, escapeRe, findAndClickPikkitGame } from '@/lib/scrapers/gameMatch'
import { acquirePikkitBrowserLease, type PikkitBrowserLifecycle } from '@/lib/pikkitBrowserLease'

export const revalidate = 0
export const maxDuration = 300

async function clickPlayerProps(page: Awaited<ReturnType<typeof openPikkitSession>>['page']) {
  const hasMarketSelect = () => page.locator('select').evaluateAll(selects => selects.some(select =>
    Array.from((select as HTMLSelectElement).options).filter(option => /touchdown|passing|rushing|receiving|reception|interception|field goal/i.test(`${option.textContent ?? ''} ${option.value}`)).length >= 2
  ))
  if (await hasMarketSelect()) return true
  for (const label of ['Player Props', 'Player prop', 'Touchdown Props', 'Props', 'Player Touchdowns', 'Touchdowns']) {
    if (await clickTabByText(page, label, false)) {
      await page.waitForTimeout(1500)
      if (await hasMarketSelect()) return true
    }
  }
  return hasMarketSelect()
}

async function scrapeGame(game: NflPikkitScheduleGame, session: BBSession) {
  const gameId = game.gameId
  try {
    await session.page.goto('https://app.pikkit.com/leagues/nfl', { waitUntil: 'domcontentloaded' })
    await session.page.waitForTimeout(1800)
    let clicked = await findAndClickPikkitGame(session.page, game.awayName, game.homeName)
    if (!clicked) {
      await session.page.waitForTimeout(2500)
      clicked = await findAndClickPikkitGame(session.page, game.awayName, game.homeName)
    }
    if (!clicked) {
      // The saved login cookie is scoped to /leagues. Event navigation must
      // stay inside the loaded app; reopening a stored URL loses that state.
      console.info('[scrape-pikkit-nfl] skipped', { gameId, stage: 'listing', reason: 'game-link-not-found' })
      return { gameId, skipped: true, error: 'NFL game link not found on Pikkit' }
    }
    await session.page.waitForTimeout(3000)
    const pageText = await session.page.evaluate(() => document.body?.innerText ?? '')
    const away = escapeRe(distinguishingSuffix(game.awayName))
    const home = escapeRe(distinguishingSuffix(game.homeName))
    if (!new RegExp(away, 'i').test(pageText) || !new RegExp(home, 'i').test(pageText)) {
      return { gameId, error: 'Pikkit navigation landed on the wrong NFL game' }
    }
    await clickTabByText(session.page, 'Odds').catch(() => false)
    await session.page.waitForTimeout(1600)
    let propsFound = await clickPlayerProps(session.page)
    if (!propsFound) {
      await session.page.waitForTimeout(3000)
      propsFound = await clickPlayerProps(session.page)
    }
    const scrape = await session.page.evaluate(runPikkitScrape, true)
    for (const diagnostic of scrape.diagnostics ?? []) {
      console.info('[scrape-pikkit-nfl] market-controls', { gameId, ...diagnostic })
    }
    delete scrape.diagnostics
    const marketCount = Object.keys(scrape.props).length
    if (!marketCount) {
      const controls = await session.page.evaluate(() => ({
        path: location.pathname,
        selects: Array.from(document.querySelectorAll('select')).map(select => Array.from(select.options).map(option => option.textContent?.trim()).slice(0, 30)),
        tabs: Array.from(document.querySelectorAll('button,[role="tab"]')).map(node => node.textContent?.trim()).filter(Boolean).slice(0, 35),
        verificationRequired: /complete verification|verify you are human/i.test(document.body.innerText),
      }))
      console.info('[scrape-pikkit-nfl] skipped', { gameId, stage: 'markets', reason: 'no-public-pick-markets', propsFound, controls })
      return { gameId, skipped: true, error: 'No NFL public-pick markets found', propsFound }
    }

    const imported = await fetch(`${PLATFORM_URL}/api/admin/nfl-pikkit-import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ gameId, json: scrape }),
      signal: AbortSignal.timeout(45_000),
    })
    const result = await imported.json().catch(() => null)
    console.info('[scrape-pikkit-nfl] complete', { gameId, marketCount, importOk: imported.ok, changed: result?.changed ?? null })
    return imported.ok
      ? { gameId, marketCount, imported: result }
      : { gameId, marketCount, error: 'NFL pick import failed', imported: result }
  } catch (error) {
    console.error('[scrape-pikkit-nfl] failed', { gameId, type: error instanceof Error ? error.name : typeof error })
    return { gameId, error: 'NFL Pikkit scrape failed' }
  }
}

async function run(req: Request, lifecycle: PikkitBrowserLifecycle) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError
  const contextId = process.env.PIKKIT_CONTEXT_ID
  if (!contextId) return NextResponse.json({ error: 'PIKKIT_CONTEXT_ID is not configured' }, { status: 500 })
  const params = new URL(req.url).searchParams
  const gameId = params.get('gameId')
  const requested = new Set((params.get('gameIds') ?? gameId ?? '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 20))
  if (!requested.size) return NextResponse.json({ error: 'gameId or gameIds is required' }, { status: 400 })
  const upcoming = await getUpcomingNflPikkitGames(7)
  const games = upcoming.filter(game => requested.has(game.gameId))
  if (!games.length) return NextResponse.json({ error: 'Upcoming NFL game not found' }, { status: 404 })

  const recovery = params.get('recovery')
  const reservationId = recovery && requested.size === games.length
    ? nflRecoveryReservation('public', games.map(game => game.gameId), Date.now(), recovery === '20261108' ? undefined : recovery) : undefined
  if (recovery !== null && !reservationId) return NextResponse.json({ error: 'NFL recovery scope unavailable' }, { status: 409 })
  lifecycle.started = true
  let bb: BBSession
  try {
    bb = await openPikkitSession(contextId, {
      sport: 'nfl', mode: games.length > 1 ? 'batch' : 'single-game',
      gameCount: games.length, gameIds: games.map(game => game.gameId).join(','),
    }, { reservationId })
  } catch (error) {
    // This exact admission error proves no create request was made. Any other
    // failure remains uncertain, so the lease must stay held until expiry.
    if (error instanceof BrowserbaseAdmissionError) lifecycle.started = false
    throw error
  }
  try {
    const results: Awaited<ReturnType<typeof scrapeGame>>[] = []
    for (let index = 0; index < games.length; index += 4) {
      const group = games.slice(index, index + 4)
      const pages = await Promise.all(group.map((_, pageIndex) => (
        index === 0 && pageIndex === 0 ? Promise.resolve(bb.page) : bb.page.context().newPage()
      )))
      const sessions = pages.map(page => ({ ...bb, page }))
      results.push(...await Promise.all(group.map((game, gameIndex) => scrapeGame(game, sessions[gameIndex]))))
      await Promise.all(pages.filter(page => page !== bb.page).map(page => page.close().catch(() => {})))
    }
    if (gameId && games.length === 1) {
      const result = results[0]
      return NextResponse.json(result, { status: result.error && !result.skipped ? 502 : 200 })
    }
    const failed = results.filter(result => result.error && !result.skipped)
    return NextResponse.json({ games: games.length, browserSessions: 1, failed: failed.length, results }, { status: failed.length ? 502 : 200 })
  } finally {
    await bb.close()
    lifecycle.closed = true
  }
}

export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError
  const lease = await acquirePikkitBrowserLease()
  if (!lease) {
    // This response is emitted before the scraper can open a browser; the
    // dispatcher can safely release only its own checkpoint reservations.
    return NextResponse.json({ error: 'NFL browser capture deferred', reason: 'context-busy', browserSessions: 0 }, { status: 423 })
  }
  const lifecycle = { started: false, closed: false }
  let response: Response
  try {
    response = await run(req, lifecycle)
  } catch (error) {
    response = error instanceof BrowserbaseAdmissionError && !lifecycle.started
      ? NextResponse.json({ error: 'NFL browser capture deferred', budgetCode: error.code, browserSessions: 0 }, { status: 425 })
      : NextResponse.json({ error: 'Pikkit browser capture or release could not be confirmed' }, { status: 502 })
  }
  const confirmedIdle = !lifecycle.started || lifecycle.closed
  const released = await lease.release(confirmedIdle).catch(() => false)
  if (confirmedIdle && !released) return NextResponse.json({ error: 'Shared browser lease release could not be confirmed' }, { status: 503 })
  return response
}
