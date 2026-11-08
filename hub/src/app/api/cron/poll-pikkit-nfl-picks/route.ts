import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { easternKickoff } from '@/lib/browserbaseRefresh'
import { nextNflRecoveryBatch } from '@/lib/nflNov8BrowserRecovery'
import { nflBrowserDecision, nflVerifiedNoCreateDenial } from '@/lib/nflBrowserCapturePolicy'
import { getNflBrowserScope, readNflBrowserAttempts, reserveNflBrowserAttempt, releaseNflBrowserAttempt, type NflBrowserReservation } from '@/lib/nflBrowserCaptureControls'

export const revalidate = 0
export const maxDuration = 300

async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError
  const games = await getUpcomingNflPikkitGames(7)
  if (!games.length) return NextResponse.json({ games: 0, attempted: 0, results: [] })

  const admin = createAdminClient()
  const now = new Date()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const window=games.filter(game=>{const kickoff=easternKickoff(game.gameDate,game.gameTime)?.getTime();return kickoff!=null&&kickoff>now.getTime()&&kickoff-now.getTime()<=24*3600_000})
  // Existing public frames lack completeness receipts; do not let a partial
  // frame suppress the one bounded retry.
  const scopes=(await Promise.all(window.map(game=>getNflBrowserScope(admin,'public',game)))).map(scope=>({...scope,observed:null}))
  const attempts=await readNflBrowserAttempts(admin,'public',scopes,now.getTime())
  const decisions=window.map((game,index)=>{
    const scope=scopes[index],initial=nflBrowserDecision(scope.kickoff,scope.observed,[],now.getTime())
    const decision=initial.slot?nflBrowserDecision(scope.kickoff,scope.observed,attempts.get(`${game.gameId}:${initial.slot}`)??[],now.getTime()):initial
    return {game,scope,decision}
  })
  // The existing scraper opens at most four pages together. Reserve only one
  // such group: a timeout cannot consume attempts for later, unvisited groups.
  const recovery = await nextNflRecoveryBatch(admin, 'public', now.getTime())
  const candidates = decisions.filter(item => item.decision.due && (!recovery || recovery.games.includes(item.game.gameId))).sort((a,b)=>a.scope.kickoff-b.scope.kickoff||(a.decision.attempt??0)-(b.decision.attempt??0)||a.game.gameId.localeCompare(b.game.gameId)).slice(0,4)
  const selected: typeof games = []
  const reservations: NflBrowserReservation[] = []
  let reservationFailures = 0
  for (const {game,scope} of recovery && candidates.length !== recovery.games.length ? [] : candidates) {
    try {
      const reservation = await reserveNflBrowserAttempt(admin,'public',scope,Date.now())
      if (reservation && Date.now()<scope.kickoff) { selected.push(game); reservations.push(reservation) }
    } catch {
      // Never replay an uncertain reservation; dispatch earlier confirmed ones.
      reservationFailures++
    }
  }
  if (recovery && selected.length !== recovery.games.length) {
    const released = await Promise.all(reservations.map(reservation => releaseNflBrowserAttempt(admin, reservation).catch(() => false)))
    if (released.some(value => !value)) reservationFailures++
    selected.length = 0
  }
  if (!selected.length) {
    return NextResponse.json({
      games: games.length, due: 0, attempted: 0, browserSessions: 0, reservationFailures,
      decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })),
      results: [],
    }, { status: reservationFailures ? 502 : 200 })
  }

  let response: Response
  let body: { results?: Array<Record<string, unknown>>; gameId?: string; marketCount?: number; error?: string; skipped?: boolean; browserSessions?:number; budgetCode?:string; reason?:string } | null = null
  try {
    response = await fetch(`${PLATFORM_URL}/api/cron/scrape-pikkit-nfl?gameIds=${encodeURIComponent(selected.map(game => game.gameId).join(','))}${recovery ? `&recovery=${recovery.id}` : ''}`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(260_000),
    })
    body = await response.json().catch(() => null)
  } catch {
    response = new Response(null, { status: 502 })
  }
  if (nflVerifiedNoCreateDenial(response.status,body,'public')) {
    // No session-create request was sent. Release only these exact owned
    // markers so the next scheduled check can retry when budget permits.
    const released=await Promise.all(reservations.map(reservation=>releaseNflBrowserAttempt(admin,reservation).catch(()=>false)))
    const releaseFailures=released.filter(value=>!value).length
    return NextResponse.json({ games: games.length, due: selected.length, attempted: 0, browserSessions: 0,
      deferred: selected.length, reservationFailures, releaseFailures, budgetCode: body?.budgetCode, reason: body?.reason, results: [] },
    { status: reservationFailures || releaseFailures ? 502 : 425 })
  }
  // The scrape route returns a flat result for one requested game, a results
  // array for multiple games, and may return 502 with some successful rows.
  const rawResults = Array.isArray(body?.results) ? body.results : body?.gameId ? [body] : []
  const results = selected.map(game => {
    const result = rawResults.find(result => result.gameId === game.gameId)
    const skipped = result?.skipped === true
    const error = typeof result?.error === 'string' ? result.error : result ? null : 'batch result missing'
    return {
      gameId: game.gameId, ok: Boolean(result) && (skipped || (!error && Number(result?.marketCount) > 0)), skipped,
      status: response.status, markets: Number(result?.marketCount ?? 0), error,
    }
  })
  const failed = results.filter(result => !result.ok)
  const allSkipped = results.length > 0 && results.every(result => result.skipped)
  const summary = { games: games.length, due: selected.length, attempted: selected.length, browserSessions: body ? body.browserSessions === 0 ? 0 : 1 : null, reservationFailures, succeeded: results.filter(result => result.ok && !result.skipped).length, failed: failed.length, skipped: results.filter(result => result.skipped).length }
  console.info('[poll-pikkit-nfl-picks] complete', { ...summary, results })
  if (reservationFailures) return NextResponse.json({ ...summary, reason: 'Some NFL capture reservations could not be confirmed', results }, { status: 502 })
  if (allSkipped) {
    return NextResponse.json({ ...summary, reason: 'NFL public captures were deferred; source availability is unconfirmed', decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })), results }, { status: 425 })
  }
  const missingToday = results.filter(result => result.skipped && games.find(game => game.gameId === result.gameId)?.gameDate === today)
  if (missingToday.length && !failed.length) return NextResponse.json({ ...summary, reason: 'Today’s NFL picks were not refreshed', decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })), results }, { status: 425 })
  return NextResponse.json({ ...summary, decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })), results }, { status: failed.length ? 502 : 200 })
}

export const GET = withPipelineHealth('poll-pikkit-nfl-picks', run, { allowSecondarySecret: true })
