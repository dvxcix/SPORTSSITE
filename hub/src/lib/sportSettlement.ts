import 'server-only'
import type { createAdminClient } from './supabase/admin'
import { PROP_META } from './watchlist'
import { fetchLiveFeed, gradeMlbPick, applyMlbPickResult, type PendingPick, type SettleOutcome, type MlbLiveFeed } from './pickGrading'
import { gradeNflPick, applyNflPickResult, supportsNflPick, type NflPendingPick } from './nflPickGrading'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'

export type SportSettlementReport = {
  claimed: number; attempted: number; checked: number; graded: number; skipped: number; won: number
  reasons: Record<string, number>; issues: string[]
}
type Pick = PendingPick & NflPendingPick & { user_id: string | null; game_date: string | null }
const PLAY_COLUMNS = 'play_id,qtr,play_type,play_deleted,two_point_attempt,sack,touchdown,pass_touchdown,rush_touchdown,pass_attempt,rush_attempt,complete_pass,interception,passing_yards,receiving_yards,rushing_yards,passer_player_id,receiver_player_id,rusher_player_id,kickoff_returner_player_id,punt_returner_player_id,fumble_recovery_1_player_id,interception_player_id,raw'
const FINAL_MESSAGES = { win: '🎉 Your pick hit! Final result: WIN', loss: 'Your pick settled — final result: LOSS', push: 'Your pick pushed (voided) — stake refunded' }

/** Background-only bounded catch-up. Each attempted pick advances fair rotation;
 * a slow or unsupported old game cannot indefinitely hide newer selections. */
export async function settleSportPicks(admin: ReturnType<typeof createAdminClient>, sport: 'MLB' | 'NFL', deadline = Date.now() + 55_000, live = false): Promise<SportSettlementReport> {
  const report: SportSettlementReport = { claimed: 0, attempted: 0, checked: 0, graded: 0, skipped: 0, won: 0, reasons: {}, issues: [] }
  const attempted = new Set<string>()
  const budget = (maximum = 5_000) => Math.max(0, Math.min(maximum, deadline - Date.now() - 2_000))
  const reason = (key: string, count = 1) => { report.reasons[key] = (report.reasons[key] ?? 0) + count }
  const issue = (key: string) => { if (!report.issues.includes(key)) report.issues.push(key) }
  if (!budget()) { issue('time-budget'); return report }
  let pending: Pick[]
  try {
    const selected = await admin.rpc('pending_sport_settlement', { p_sport: sport, p_limit: 200 }).abortSignal(AbortSignal.timeout(budget()))
    if (selected.error) throw Error('Pending unavailable')
    pending = selected.data ?? []
  } catch { issue('pending-unavailable'); return report }
  report.claimed = pending.length
  const groups = new Map<string, Pick[]>()
  for (const pick of pending) groups.set(pick.game_pk, [...(groups.get(pick.game_pk) ?? []), pick])
  const queue = [...groups.entries()]

  async function notify(pick: Pick, outcome: SettleOutcome, final: boolean) {
    if (!live || !pick.user_id || !pick.post_id) return
    const messages: string[] = []
    if (outcome.result === 'win') messages.push(outcome.legPlayerName ? `🎉 ${outcome.legPlayerName} ${final ? 'came through — that leg hit!' : 'just hit — your pick is looking good!'}` : '🎉 Your pick just hit!')
    if (final && outcome.overallResult) messages.push(FINAL_MESSAGES[outcome.overallResult])
    for (const message of messages) {
      if (!budget()) { issue('notification-failed'); return }
      try {
        const saved = await admin.from('notifications').insert({ user_id: pick.user_id, type: 'pick_result', message, link: `/posts/${pick.post_id}`, target_id: pick.post_id, target_type: 'post', data: outcome.legHeadshotUrl ? { avatar_url: outcome.legHeadshotUrl } : null }).abortSignal(AbortSignal.timeout(budget()))
        if (saved.error) issue('notification-failed')
      } catch { issue('notification-failed') }
    }
  }

  async function worker() {
    while (queue.length) {
      const [gameId, picks] = queue.shift()!
      if (budget() < 1_000) { report.skipped += picks.length; reason('time-budget', picks.length); issue('time-budget'); continue }
      let facts: { feed?: MlbLiveFeed; stats?: Parameters<typeof gradeNflPick>[1]; plays?: Parameters<typeof gradeNflPick>[2]; final: boolean } | null = null
      try {
        if ((sport === 'MLB' && !/^\d+$/.test(gameId ?? '')) || (sport === 'NFL' && !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId ?? ''))) {
          picks.forEach(p => attempted.add(p.id)); report.skipped += picks.length; reason('invalid-identity', picks.length); issue('invalid-identity'); continue
        }
        // The request itself is an attempt, even if source data is unavailable.
        picks.forEach(p => attempted.add(p.id))
        if (sport === 'MLB') {
          const feed = await fetchLiveFeed(gameId, budget(10_000))
          if (!feed) throw Error('Final source unavailable')
          const state = feed.gameData?.status?.abstractGameState
          if (state !== 'Final' && !(live && state === 'Live')) { report.skipped += picks.length; reason('not-final', picks.length); continue }
          facts = { feed, final: state === 'Final' }
        } else {
          const gameResult = await admin.from('nfl_schedule').select('season,week,game_type,gameday,gametime,home_score,away_score').eq('game_id', gameId).abortSignal(AbortSignal.timeout(budget())).maybeSingle()
          if (gameResult.error) throw Error('Game unavailable')
          const game = gameResult.data, kickoff = game ? nflKickoffAt(game) : null
          if (!game || game.home_score == null || game.away_score == null || !kickoff || Date.now() <= kickoff.getTime() + 7 * 3_600_000) { report.skipped += picks.length; reason('not-final', picks.length); continue }
          if (!budget()) throw Error('Source deadline')
          const [stats, plays] = await Promise.all([
            admin.from('nfl_player_stats').select('*').eq('game_id', gameId).abortSignal(AbortSignal.timeout(budget())),
            admin.from('nfl_pbp').select(PLAY_COLUMNS).eq('game_id', gameId).order('play_id').range(0, 999).abortSignal(AbortSignal.timeout(budget())),
          ])
          if (stats.error || plays.error || !plays.data?.length || plays.data.length >= 1000) throw Error('Final facts unavailable')
          facts = { stats: stats.data ?? [], plays: plays.data, final: true }
        }
      } catch { report.skipped += picks.length; reason('source-unavailable', picks.length); issue('source-unavailable'); continue }
      for (const pick of picks) {
        if (!budget()) { report.skipped++; reason('time-budget'); issue('time-budget'); continue }
        report.checked++
        if ((sport === 'MLB' && !pick.mlb_id) || (sport === 'NFL' && !pick.player_id)) { report.skipped++; reason('invalid-identity'); issue('invalid-identity'); continue }
        const grade = sport === 'MLB' ? gradeMlbPick(pick, facts.feed!, facts.final)
          : { result: gradeNflPick(pick, facts.stats!, facts.plays!), reason: supportsNflPick(pick) ? 'missing-stats' : 'unsupported-contract' }
        if (!grade.result) { report.skipped++; reason(grade.reason); if (grade.reason !== 'graded' && grade.reason !== 'not-final') issue(grade.reason); continue }
        try {
          if (!budget()) { report.skipped++; reason('time-budget'); issue('time-budget'); continue }
          const outcome = sport === 'MLB' ? await applyMlbPickResult(admin, pick, grade.result, PROP_META, budget()) : await applyNflPickResult(admin, pick, grade.result, budget())
          if (!outcome) { report.skipped++; reason('already-settled'); continue }
          report.graded++; if (grade.result === 'win') report.won++
          if (sport === 'MLB') await notify(pick, outcome as SettleOutcome, facts.final)
        } catch { report.skipped++; reason('write-failed'); issue('write-failed') }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
  report.attempted = attempted.size
  if (attempted.size) {
    try {
      const remaining = Math.min(2_000, deadline - Date.now())
      if (remaining <= 0) throw Error('Checkpoint deadline')
      const checkpoint = await admin.from('sport_settlement_attempts').upsert([...attempted].map(pick_id => ({ pick_id, checked_at: new Date().toISOString() })), { onConflict: 'pick_id' }).abortSignal(AbortSignal.timeout(remaining))
      if (checkpoint.error) throw Error('Checkpoint failed')
    } catch { issue('checkpoint-failed') }
  }
  return report
}
