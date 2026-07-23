import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import {
  getBDLGames, getBDLPlayerProps, getBDLPlayerNames, buildPropMap,
  matchBDLGame, addDaysToDateStr, toETDate,
  type BDLGame, type BDLPropMap,
} from '@/lib/balldontlie'
import { canonGameKey } from '@/lib/teamAbbr'
import { normName } from '@/lib/nameNorm'

// Bare market keys shared with fanduel-import's own OPENING_MARKET list —
// whichever pipeline sees a real price for a given (game, player, market)
// FIRST wins the permanent opening baseline (market_opening_prices' PK
// enforces that, not this list). Only markets BDL actually prices via
// `.fanduel` are worth attempting here; laser/moonshot/pa1/hrMl/combo* are
// FanDuel-gap-only and never appear in a BDL propMap entry.
const BDL_OPENING_MARKETS = [
  'fhr', 'sa', 'hr2', 'hr3', 'hits', 'hits2', 'hits3', 'rbi', 'rbi2', 'rbi3',
  'tb', 'tb3', 'tb4', 'tb5', 'strikeouts', 'strikeouts2', 'strikeouts3',
  'singles', 'singles2', 'singles3', 'doubles', 'doubles2', 'doubles3',
  'triples', 'triples2', 'triples3', 'stolen_bases', 'stolen_bases2', 'stolen_bases3',
  'runs', 'runs2', 'runs3', 'hrr',
] as const

export const revalidate = 0
export const maxDuration = 60

// Runs every minute (see vercel.json) and is now the ONLY thing that ever
// calls BDL live. Previously dugout/data/route.ts hit BDL fresh on every
// single page load for every not-yet-started game — with hundreds of users
// independently loading/refreshing Dugout, each one could trigger its own
// upstream BDL call (Next's fetch cache is NOT shared across concurrent
// serverless invocations here — no custom cache handler is configured, and
// Route Handlers don't get React's in-flight request memoization either),
// so real concurrent traffic had no actual ceiling on how many simultaneous
// BDL calls it could produce. This cron polls once, on a fixed schedule,
// and writes into pregame_odds_snapshots — every page load just reads that
// table, so BDL load is flat (one poll's worth of requests per minute)
// regardless of how many people are looking at the page at once.
//
// Budget: GOAT tier = 600 req/min. A full slate is ~1 games call + ~15
// player_props calls (one per game) + a couple of players chunks — well
// under 3% of budget even every minute, so there's no need to spread this
// across a longer interval.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('[bdl-odds cron] admin client not configured', e)
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 })
  }

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // Just enough hydration to match games and skip started ones — no lineups
  // needed here, that's the page's own concern when it reads this back.
  let mlbGames: any[] = []
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team`,
      { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
    )
    if (res.ok) mlbGames = (await res.json()).dates?.[0]?.games ?? []
  } catch (e) {
    console.error('[bdl-odds cron] MLB schedule fetch failed', e)
  }

  // Once a game is live/final, live odds aren't pregame research anymore —
  // stop touching its row entirely so the page's freeze-on-first-observation
  // logic can permanently lock whatever was last captured here, unchanged.
  const pendingGames = mlbGames.filter((g: any) => (g.status?.abstractGameState ?? 'Preview') === 'Preview')
  if (!pendingGames.length) {
    return NextResponse.json({ date, matched: 0, totalGames: mlbGames.length, note: 'No pending (pregame) games right now' })
  }

  // BDL's dates[] filter matches UTC calendar day, not ET — a late-ET game
  // tonight can roll into tomorrow's UTC date. Fetch both, same as the old
  // per-request logic did.
  const [bdlGamesDay1, bdlGamesDay2] = await Promise.all([
    getBDLGames(date),
    getBDLGames(addDaysToDateStr(date, 1)),
  ])
  const bdlGamesById = new Map<number, BDLGame>()
  for (const g of [...bdlGamesDay1, ...bdlGamesDay2]) bdlGamesById.set(g.id, g)
  const bdlGames = Array.from(bdlGamesById.values()).filter(g => toETDate(g.date) === date)

  // Sequential (not Promise.all) — deliberate, same reasoning as before:
  // avoids a doubleheader race against the shared claimedBdlIds set. Budget
  // headroom is no longer the concern (GOAT tier, ~15 calls/min vs 600/min).
  const claimedBdlIds = new Set<number>()
  const matched: { gamePk: string; homeAbbr: string; awayAbbr: string; gameKey: string; bdlGameId: number; props: any[] }[] = []
  for (const g of pendingGames) {
    const homeTeam = g.teams?.home?.team?.name || ''
    const awayTeam = g.teams?.away?.team?.name || ''
    const homeAbbr = g.teams?.home?.team?.abbreviation || homeTeam.split(' ').pop() || ''
    const awayAbbr = g.teams?.away?.team?.abbreviation || awayTeam.split(' ').pop() || ''
    const gameNum = g.gameNumber ?? 1
    const gameKey = canonGameKey(gameNum > 1 ? `${awayAbbr}@${homeAbbr}-G${gameNum}` : `${awayAbbr}@${homeAbbr}`)
    const bdlGame = matchBDLGame(bdlGames.filter(bg => !claimedBdlIds.has(bg.id)), homeTeam, awayTeam, g.gameDate)
    if (!bdlGame) continue
    claimedBdlIds.add(bdlGame.id)
    const props = await getBDLPlayerProps(bdlGame.id)
    matched.push({ gamePk: String(g.gamePk), homeAbbr, awayAbbr, gameKey, bdlGameId: bdlGame.id, props })
  }

  const allPlayerIds = matched.flatMap(x => x.props.map((p: any) => p.player_id))
  const playerNames = await getBDLPlayerNames(allPlayerIds)

  const upserts = matched.map(entry => {
    const propMap: BDLPropMap = buildPropMap(entry.props, playerNames)
    return {
      game_pk: entry.gamePk,
      game_date: date,
      bdl_game_id: entry.bdlGameId,
      home_abbr: entry.homeAbbr,
      away_abbr: entry.awayAbbr,
      prop_map: propMap,
      is_frozen: false,
      captured_at: new Date().toISOString(),
    }
  })

  // Unified opening-price capture — whichever pipeline (this cron, or the
  // Browserbase-driven fanduel-import route) observes a real price for a
  // given (game, player, market, BOOK) FIRST becomes the permanent baseline;
  // market_opening_prices' own PK + ignoreDuplicates below is what actually
  // enforces that, so this can safely fire on every single one-minute poll —
  // every later attempt for an already-captured key is just a harmless no-op.
  // Every vendor BDL reports for a market gets its own opener, not just
  // fanduel — BetMGM's own live price now comes straight through BDL same as
  // every other book (confirmed live: DugoutClient's sa_mgm/hr2_mgm current
  // price already reads props.sa.betmgm/props.hr2.betmgm, not a separate
  // scrape), so it gets the exact same first-observation-wins treatment.
  // Zips against `matched` (not `upserts`, which has no gameKey field of its
  // own — that's not a real pregame_odds_snapshots column) by shared index,
  // since upserts was built via a straight 1:1 .map over matched above.
  const openingRows: { game_date: string; game_key: string; name_norm: string; market: string; book: string; opening_price: number; opening_source: 'bdl' }[] = []
  upserts.forEach((u, i) => {
    const gameKey = matched[i].gameKey
    for (const entry of Object.values(u.prop_map)) {
      const nn = normName((entry as any).name || '')
      if (!nn) continue
      for (const market of BDL_OPENING_MARKETS) {
        const vendorMap = (entry as any)[market]
        if (!vendorMap) continue
        for (const [book, price] of Object.entries(vendorMap)) {
          if (typeof price === 'number') {
            openingRows.push({ game_date: date, game_key: gameKey, name_norm: nn, market, book, opening_price: price, opening_source: 'bdl' })
          }
        }
      }
    }
  })

  if (upserts.length) {
    const { error } = await admin.from('pregame_odds_snapshots').upsert(upserts, { onConflict: 'game_pk' })
    if (error) console.error('[bdl-odds cron] snapshot upsert failed', error)

    // Append-only companion to the upsert above — the upsert only ever
    // keeps the LATEST value per game_pk, so this is the only place an
    // intraday trail of odds movement actually survives (see Batter Cost).
    // Best-effort: a failure here shouldn't affect the live snapshot the
    // rest of the app depends on.
    const { error: historyError } = await admin.from('pregame_odds_snapshot_history').insert(
      upserts.map(u => ({ game_pk: u.game_pk, game_date: u.game_date, prop_map: u.prop_map, captured_at: u.captured_at }))
    )
    if (historyError) console.error('[bdl-odds cron] snapshot history insert failed', historyError)
  }

  if (openingRows.length) {
    const { error: openingError } = await admin
      .from('market_opening_prices')
      .upsert(openingRows, { onConflict: 'game_date,game_key,name_norm,market,book', ignoreDuplicates: true })
    if (openingError) console.error('[bdl-odds cron] opening-price upsert failed', openingError)
  }

  return NextResponse.json({ date, pendingGames: pendingGames.length, bdlGamesSeen: bdlGames.length, matched: upserts.length, openingRowAttempts: openingRows.length })
}
