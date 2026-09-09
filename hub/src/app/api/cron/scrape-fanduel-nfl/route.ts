import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { openSession } from '@/lib/browserbase'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runFanduelScrape } from '@/lib/scrapers/fanduelScraper'
import { findAndClickGame } from '@/lib/scrapers/gameMatch'
import { parseNflFanduel, type FdTab } from '@/lib/scrapers/nflFanduelMarkets'
import { attachNflFanduel, loadNflFanduel } from '@/lib/nflFanduel'
import { ingestNflMarketBoard } from '@/lib/nflMarketArchive'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'

export const maxDuration = 300
export const revalidate = 0

export async function GET(req: Request) {
  const auth = requireBrowserbaseCronAuth(req)
  if (auth) {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return auth
    const { data: profile } = await client.from('users').select('account_type').eq('id', user.id).maybeSingle()
    if (profile?.account_type !== 'admin') return auth
  }
  const url = new URL(req.url)
  const gameId = url.searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const game = (await getUpcomingNflPikkitGames(7)).find(g => g.gameId === gameId)
  if (!game) return NextResponse.json({ error: 'Upcoming game not found' }, { status: 404 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('nfl_odds_current').select('board').eq('game_id', gameId).maybeSingle()
  if (error || !data?.board?.players?.length) return NextResponse.json({ error: 'Canonical player identities not ready' }, { status: 425 })
  const base = attachNflFanduel(data.board as SidelineOddsBoard, await loadNflFanduel(gameId))
  const session = await openSession({ metadata: { book: 'fanduel', sport: 'nfl', gameId } })
  try {
    await session.page.goto('https://sportsbook.fanduel.com/navigation/nfl', { waitUntil: 'domcontentloaded' })
    await session.page.waitForTimeout(2500)
    await session.page.getByText('GAMES', { exact: true }).first().click({ timeout: 4000 }).catch(() => {})
    let clicked = await findAndClickGame(session.page, game.awayName, game.homeName)
    if (!clicked) {
      await session.page.waitForTimeout(4000)
      clicked = await findAndClickGame(session.page, game.awayName, game.homeName)
    }
    if (!clicked) return NextResponse.json({ error: 'NFL game link not found', ...(url.searchParams.get('dryRun') === '1' ? {
      title: await session.page.title(), url: session.page.url(),
      text: (await session.page.locator('body').innerText()).slice(0, 6000),
      links: await session.page.locator('a').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, href: n.getAttribute('href') })).filter(n => /patriots|seahawks|new england|seattle/i.test(n.text ?? '')).slice(0, 10)),
    } : {}) }, { status: 425 })
    await session.page.waitForTimeout(2500)
    const tabs = await session.page.evaluate(runFanduelScrape, { maxDurationMs: 230000 }) as (FdTab & { incomplete?: boolean })[]
    const away = game.awayName.split(' ').at(-1)!.toLowerCase()
    const home = game.homeName.split(' ').at(-1)!.toLowerCase()
    if (!tabs.length || tabs.some(t => !t.event.title.toLowerCase().includes(away) || !t.event.title.toLowerCase().includes(home))) return NextResponse.json({ error: 'Event identity mismatch' }, { status: 502 })
    const parsed = parseNflFanduel(tabs, base)
    const summary = { gameId, tabs: tabs.length, incomplete: tabs.some(t => t.incomplete), players: parsed.board.players.length, markets: parsed.board.players.reduce((sum, p) => sum + p.markets.length, 0), rejected: parsed.rejected }
    if (url.searchParams.get('dryRun') === '1') return NextResponse.json({ ...summary, raw: tabs })
    if (!parsed.board.players.length) return NextResponse.json({ ...summary, error: 'No recognized NFL markets' }, { status: 425 })
    if (!(await getUpcomingNflPikkitGames(7)).some(g => g.gameId === gameId)) return NextResponse.json({ error: 'Kickoff reached; capture discarded' }, { status: 409 })
    const { error: saveError } = await admin.from('nfl_fanduel_capture_history').insert({ game_id: gameId, captured_at: parsed.board.capturedAt, board: parsed.board, raw_tabs: tabs })
    if (saveError) throw new Error('Capture archive failed')
    await ingestNflMarketBoard(admin, { game_id: gameId, season: game.season, week: game.week, game_type: game.gameType, gameday: game.gameDate, away_team: game.awayAbbr, home_team: game.homeAbbr }, parsed.board, 'fanduel-browser')
    revalidateTag('sideline:nfl-odds', 'max')
    return NextResponse.json(summary)
  } catch (error) {
    console.error('[scrape-fanduel-nfl]', error instanceof Error ? error.message : 'failed')
    return NextResponse.json({ error: 'NFL extraction failed' }, { status: 502 })
  } finally { await session.close() }
}
