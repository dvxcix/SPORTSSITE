import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { scrapeMgmCdsGame } from '@/lib/scrapers/mgmCds'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { needsBetMgmFallback } from '@/lib/scrapers/mgmCoverage'
import { safeErrorMetadata } from '@/lib/safeApiError'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 300
export const GET = withPipelineHealth('scrape-mgm', run, { allowSecondarySecret: true })

// Uses BetMGM's public MLB fixtures feed, discovered from the live listing
// page, to collect every visible 1+ and 2+ batter home-run price for a
// specific game. The fixture is matched by both team names and start time,
// then each threshold is posted to mgm-import under the trusted gameKey.
//
// Called two ways: ?gamePk=123 scrapes just that game; no gamePk fans out
// one concurrent request per today's game back to this same route instead
// of looping in-process (see fanOutToSelf).
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/mgm-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey, isOpening: true }),
    signal: AbortSignal.timeout(45_000),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

async function scrapeOneGame(g: TodayGame, date: string, dryRun: boolean) {
  // BetMGM is state-gated, so the Browserbase session establishes the
  // permitted NC context and supplies the current public feed access id.
  const bb = await openSession({ geoState: 'NC', metadata: { book: 'mgm', gameKey: g.gameKey, gamePk: String(g.gamePk) } })
  try {
    const { fixtureId, fixtureName, scrapes } = await scrapeMgmCdsGame(bb.page, g)

    if (dryRun) return { gameKey: g.gameKey, fixtureId, fixtureName, thresholdsScraped: scrapes.length, dryRun: true, scrapes }

    const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, fixtureId, fixtureName, thresholdsScraped: scrapes.length, imported }
  } catch (error) {
    console.error('[scrape-mgm] game failed', { gameKey: g.gameKey, ...safeErrorMetadata(error) })
    return { gameKey: g.gameKey, error: 'scrape failed' }
  } finally {
    await bb.close()
  }
}

async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const reqUrl = new URL(req.url)
  const gamePkParam = reqUrl.searchParams.get('gamePk')
  const dryRun = reqUrl.searchParams.get('dryRun') === '1'
  const force = reqUrl.searchParams.get('force') === '1'

  const eligible = games.filter(g =>
    isPregame(g.status) && g.homeLineupConfirmed && g.awayLineupConfirmed
  )
  const admin = createAdminClient()
  const eligiblePks = eligible.map(g => String(g.gamePk))
  const snapshotByPk = new Map<string, unknown>()
  if (eligiblePks.length) {
    const { data, error } = await admin
      .from('pregame_odds_snapshots')
      .select('game_pk,prop_map')
      .eq('game_date', date)
      .in('game_pk', eligiblePks)
    if (error) {
      console.error('[scrape-mgm] coverage query failed', { code: error.code })
      return NextResponse.json({ reason: 'Could not verify BetMGM coverage' }, { status: 502 })
    }
    for (const row of data ?? []) snapshotByPk.set(String(row.game_pk), row.prop_map)
  }

  const missingCoverage = eligible.filter(g =>
    force || needsBetMgmFallback(snapshotByPk.get(String(g.gamePk)), g.homeLineup.length + g.awayLineup.length)
  )

  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in today's matchups` }, { status: 404 })
    if (!isPregame(g.status)) {
      return NextResponse.json({ date, gamePk, skipped: 'game already started' })
    }
    if (!g.homeLineupConfirmed || !g.awayLineupConfirmed) {
      return NextResponse.json({ date, gamePk, skipped: 'waiting for both confirmed lineups' })
    }
    if (!force && !missingCoverage.some(x => x.gamePk === gamePk)) {
      return NextResponse.json({ date, gamePk, skipped: 'BDL BetMGM coverage is healthy' })
    }
    const result = await scrapeOneGame(g, date, dryRun)
    return NextResponse.json({ date, gamePk, result }, { status: 'error' in result ? 502 : 200 })
  }

  if (!missingCoverage.length) {
    return NextResponse.json({ date, eligibleGames: eligible.length, missingCoverage: 0, skipped: 'BDL BetMGM coverage is healthy' })
  }

  const results = await fanOutToSelf('/api/cron/scrape-mgm', missingCoverage.map(g => g.gamePk), dryRun ? '&dryRun=1' : '')
  const completed = results.filter(result => result.status === 200 && !result.body?.result?.error).length
  const response = {
    date,
    eligibleGames: eligible.length,
    missingCoverage: missingCoverage.length,
    attemptedGamePks: missingCoverage.map(g => g.gamePk),
    completed,
    results,
  }
  return NextResponse.json(response, { status: completed > 0 ? 200 : 502 })
}
