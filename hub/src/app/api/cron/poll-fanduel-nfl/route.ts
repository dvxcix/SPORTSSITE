import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { requestNflCapture } from '@/lib/nflCaptureRequest'
import { nflCaptureResultStatus, NFL_CAPTURE_REQUEST_TIMEOUT_MS, NFL_CAPTURE_BATCH_SIZE } from '@/lib/nflCaptureDispatch'
import { easternKickoff } from '@/lib/browserbaseRefresh'
import { nflBrowserDecision, nflVerifiedNoCreateDenial } from '@/lib/nflBrowserCapturePolicy'
import { getNflBrowserScope, readNflBrowserAttempts, reserveNflBrowserAttempt, releaseNflBrowserAttempt, type NflBrowserReservation } from '@/lib/nflBrowserCaptureControls'

export const maxDuration = 600
export const revalidate = 0
export const GET = withPipelineHealth('poll-fanduel-nfl', run, { allowSecondarySecret: true })
async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>) {
  const output: R[] = []
  for (let index = 0; index < items.length; index += size) output.push(...await Promise.all(items.slice(index, index + size).map(worker)))
  return output
}
async function run(req: Request) {
  const auth = requireBrowserbaseCronAuth(req)
  if (auth) return auth
  const upcoming = await getUpcomingNflPikkitGames(7)
  const now = new Date()
  const admin = createAdminClient()
  // Unpublished canonical players must not consume the two capture slots.
  const { data: readyRows, error: readyError } = upcoming.length ? await admin.from('nfl_odds_current')
    .select('game_id').in('game_id', upcoming.map(game => game.gameId))
    .not('board->players->0', 'is', null) : { data: [], error: null }
  if (readyError) throw new Error('Canonical capture readiness unavailable')
  const readyIds = new Set((readyRows ?? []).map(row => row.game_id))
  const readyGames = upcoming.filter(game => readyIds.has(game.gameId))
  // Every-20-minute scheduler calls are cheap decision checks; only the two
  // pregame checkpoints can enter the paid scraper. Existing legacy captures
  // do not prove every tab was complete, so they cannot suppress the retry.
  const inWindow=readyGames.filter(game=>{const kickoff=easternKickoff(game.gameDate,game.gameTime)?.getTime();return kickoff!=null&&kickoff>now.getTime()&&kickoff-now.getTime()<=24*3600_000})
  const scopes=(await Promise.all(inWindow.map(game=>getNflBrowserScope(admin,'fanduel',game)))).map(scope=>({...scope,observed:null}))
  const attempts=await readNflBrowserAttempts(admin,'fanduel',scopes,now.getTime())
  const candidates=inWindow.map((game,index)=>{
    const scope=scopes[index], initial=nflBrowserDecision(scope.kickoff,scope.observed,[],now.getTime())
    const decision=initial.slot?nflBrowserDecision(scope.kickoff,scope.observed,attempts.get(`${game.gameId}:${initial.slot}`)??[],now.getTime()):initial
    return {game,scope,decision}
  }).filter(item=>item.decision.due).sort((a,b)=>
    Number(b.decision.slot==='two-hours')-Number(a.decision.slot==='two-hours') || a.scope.kickoff-b.scope.kickoff || (a.decision.attempt??0)-(b.decision.attempt??0) || a.game.gameId.localeCompare(b.game.gameId)
  ).slice(0,NFL_CAPTURE_BATCH_SIZE)
  const games: {game: typeof inWindow[number]; reservation:NflBrowserReservation}[] = []
  let reservationFailures = 0
  for (const {game,scope} of candidates) {
    try {
      const reservation=await reserveNflBrowserAttempt(admin,'fanduel',scope,Date.now())
      if (reservation && Date.now()<scope.kickoff) games.push({game,reservation})
    } catch {
      // An ambiguous reservation must not launch, but earlier confirmed
      // reservations should still be dispatched, never silently discarded.
      reservationFailures++
    }
  }
  const results = await inBatches(games, 2, async ({game,reservation}) => {
    const requestStarted = Date.now()
    try {
      const response = await requestNflCapture(`${PLATFORM_URL}/api/cron/scrape-fanduel-nfl?stream=1&gameId=${encodeURIComponent(game.gameId)}`,
        { authorization: `Bearer ${process.env.CRON_SECRET}` }, NFL_CAPTURE_REQUEST_TIMEOUT_MS)
      const envelope = await response.json()
      if (response.ok && (!Number.isInteger(envelope.status) || envelope.status < 100 || envelope.status > 599 || !envelope.body || typeof envelope.body !== 'object')) throw new Error('Invalid capture envelope')
      const status = Number.isInteger(envelope.status) ? envelope.status : response.status
      const body = envelope.body ?? envelope
      const noCreate=response.ok && nflVerifiedNoCreateDenial(status,body,'fanduel')
      const releaseFailed=noCreate && !(await releaseNflBrowserAttempt(admin,reservation).catch(()=>false))
      return { ...body, gameId: game.gameId, ok: status >= 200 && status < 300 && body.incomplete !== true, deferred: status === 425 && !releaseFailed, releaseFailed, httpStatus: status }
    } catch (error) {
      // Persist only bounded diagnostic identifiers, never URLs, headers or messages.
      const failure = error as { name?: unknown; code?: unknown; syscall?: unknown; capturePhase?: unknown }
      const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_]{1,60}$/.test(value) ? value : undefined
      return { gameId: game.gameId, ok: false, error: 'Capture request failed',
        errorName: identifier(failure?.name), errorCode: identifier(failure?.code),
        errorSyscall: identifier(failure?.syscall), requestPhase: identifier(failure?.capturePhase), elapsedMs: Date.now() - requestStarted }
    }
  })
  const summary = { discovered: upcoming.length, games: games.length, reservationFailures, succeeded: results.filter(result => result.ok).length, deferred: results.filter(result => 'deferred' in result && result.deferred).length, failed: results.filter(result => !result.ok && !('deferred' in result && result.deferred)).length }
  console.info('[poll-fanduel-nfl] complete', { ...summary, results })
  const status = reservationFailures || results.some(result => result.releaseFailed) ? 502 : upcoming.length > 0 && readyGames.length === 0 ? 425 : nflCaptureResultStatus(results)
  const budgetDeferred = results.some(result => result.deferred && result.browserSessions === 0 && typeof result.budgetCode === 'string')
  return NextResponse.json({ ...summary, waitingForCanonical: upcoming.length - readyGames.length, results,
    ...(status === 425 ? { reason: budgetDeferred ? 'Browser captures deferred by spending controls.' : 'Player markets are not ready for one or more games; retry scheduled.' } : {}) }, { status })
}
