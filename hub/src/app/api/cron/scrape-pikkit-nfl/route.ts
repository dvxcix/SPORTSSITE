import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { openPikkitSession } from '@/lib/browserbase'
import { PLATFORM_URL } from '@/lib/platform'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { createAdminClient } from '@/lib/supabase/admin'
import { runPikkitScrape } from '@/lib/scrapers/pikkitScraper'
import { clickTabByText, distinguishingSuffix, escapeRe, findAndClickPikkitGame } from '@/lib/scrapers/gameMatch'

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

export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError
  const contextId = process.env.PIKKIT_CONTEXT_ID
  if (!contextId) return NextResponse.json({ error: 'PIKKIT_CONTEXT_ID is not configured' }, { status: 500 })
  const gameId = new URL(req.url).searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  const games = await getUpcomingNflPikkitGames(7)
  const game = games.find(candidate => candidate.gameId === gameId)
  if (!game) return NextResponse.json({ error: 'Upcoming NFL game not found' }, { status: 404 })

  const bb = await openPikkitSession(contextId, { sport: 'nfl', mode: 'single-game', gameId })
  try {
    await bb.page.route('**/*', route => {
      const type = route.request().resourceType()
      return type === 'image' || type === 'media' || type === 'font' ? route.abort() : route.continue()
    })
    await bb.page.goto('https://app.pikkit.com/leagues/nfl', { waitUntil: 'domcontentloaded' })
    await bb.page.waitForTimeout(1800)
    let clicked = await findAndClickPikkitGame(bb.page, game.awayName, game.homeName)
    if (!clicked) {
      await bb.page.waitForTimeout(2500)
      clicked = await findAndClickPikkitGame(bb.page, game.awayName, game.homeName)
    }
    if (!clicked) {
      // A previously verified event can remain accessible while the league
      // listing is still loading or has reordered. Never invent event URLs.
      const { data } = await createAdminClient().from('nfl_pikkit_picks_current')
        .select('snapshot').eq('game_id', gameId).maybeSingle()
      const priorUrl = data?.snapshot?.sourceUrl
      if (typeof priorUrl === 'string' && /^https:\/\/app\.pikkit\.com\/event\/[a-z0-9-]+$/i.test(priorUrl)) {
        await bb.page.goto(priorUrl, { waitUntil: 'domcontentloaded' })
        clicked = true
      }
    }
    if (!clicked) {
      console.info('[scrape-pikkit-nfl] skipped', { gameId, stage: 'listing', reason: 'game-link-not-found' })
      return NextResponse.json({ gameId, skipped: true, error: 'NFL game link not found on Pikkit' })
    }
    await bb.page.waitForTimeout(3000)
    const pageText = await bb.page.evaluate(() => document.body?.innerText ?? '')
    const away = escapeRe(distinguishingSuffix(game.awayName))
    const home = escapeRe(distinguishingSuffix(game.homeName))
    if (!new RegExp(away, 'i').test(pageText) || !new RegExp(home, 'i').test(pageText)) {
      return NextResponse.json({ gameId, error: 'Pikkit navigation landed on the wrong NFL game' }, { status: 502 })
    }
    await clickTabByText(bb.page, 'Odds').catch(() => false)
    await bb.page.waitForTimeout(1600)
    let propsFound = await clickPlayerProps(bb.page)
    if (!propsFound) {
      await bb.page.waitForTimeout(3000)
      propsFound = await clickPlayerProps(bb.page)
    }
    const scrape = await bb.page.evaluate(runPikkitScrape, true)
    for (const diagnostic of scrape.diagnostics ?? []) {
      console.info('[scrape-pikkit-nfl] market-controls', { gameId, ...diagnostic })
    }
    delete scrape.diagnostics
    const marketCount = Object.keys(scrape.props).length
    if (!marketCount) {
      const controls = await bb.page.evaluate(() => ({
        path: location.pathname,
        selects: Array.from(document.querySelectorAll('select')).map(select => Array.from(select.options).map(option => option.textContent?.trim()).slice(0, 30)),
        tabs: Array.from(document.querySelectorAll('button,[role="tab"]')).map(node => node.textContent?.trim()).filter(Boolean).slice(0, 35),
        verificationRequired: /complete verification|verify you are human/i.test(document.body.innerText),
      }))
      console.info('[scrape-pikkit-nfl] skipped', { gameId, stage: 'markets', reason: 'no-public-pick-markets', propsFound, controls })
      return NextResponse.json({ gameId, skipped: true, error: 'No NFL public-pick markets found', propsFound })
    }

    const imported = await fetch(`${PLATFORM_URL}/api/admin/nfl-pikkit-import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ gameId, json: scrape }),
      signal: AbortSignal.timeout(45_000),
    })
    const result = await imported.json().catch(() => null)
    console.info('[scrape-pikkit-nfl] complete', { gameId, marketCount, importOk: imported.ok, changed: result?.changed ?? null })
    return NextResponse.json({ gameId, marketCount, imported: result }, { status: imported.ok ? 200 : 502 })
  } catch (error) {
    console.error('[scrape-pikkit-nfl] failed', { gameId, type: error instanceof Error ? error.name : typeof error })
    return NextResponse.json({ gameId, error: 'NFL Pikkit scrape failed' }, { status: 502 })
  } finally {
    await bb.close()
  }
}
