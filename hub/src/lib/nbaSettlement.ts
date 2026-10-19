import 'server-only'
import type { createAdminClient } from './supabase/admin'
import { getPaintGame, getPaintFinalStats } from './nbaPaintData'
import { gradeNbaPick, type NbaPendingPick } from './nbaPickGrading'
import { nbaPeriod } from './nbaPaint'

export async function settleNbaPicks(admin: ReturnType<typeof createAdminClient>, deadline = Date.now() + 48_000) {
  const report = { claimed: 0, attempted: 0, checked: 0, graded: 0, skipped: 0, graded_ids: [] as string[], issues: [] as string[] }
  const checkpointReserve = 2_000
  const rpcBudget = () => Math.min(5_000, deadline - Date.now() - checkpointReserve)
  const selectionBudget = rpcBudget()
  if (selectionBudget <= 0) { report.issues.push('NBA time budget reached'); return report }
  let pending: NbaPendingPick[]
  try {
    const { data, error } = await admin.rpc('claim_pending_nba_picks', { p_limit: 200 }).abortSignal(AbortSignal.timeout(selectionBudget))
    if (error) { report.issues.push('NBA pending picks unavailable'); return report }
    pending = (data ?? []) as NbaPendingPick[]
  } catch { report.issues.push('NBA pending picks unavailable'); return report }
  report.claimed = pending.length
  const groups = new Map<string, NbaPendingPick[]>()
  for (const pick of pending) groups.set(pick.game_pk, [...(groups.get(pick.game_pk) ?? []), pick])
  for (const [id, picks] of groups) {
    // A fresh game request and at most two stat pages each cap at 12 seconds.
    if (Date.now() + 36_000 + checkpointReserve > deadline) { report.skipped += picks.length; report.issues.push('NBA time budget reached'); continue }
    const attempted = new Set<string>()
    const completed = new Set<string>()
    let factsReady = false
    try {
      if (!/^\d{1,10}$/.test(id)) { picks.forEach(pick => attempted.add(pick.id)); report.skipped += picks.length; continue }
      const game = await getPaintGame(Number(id), true)
      if (game.status_state !== 'final' && game.status !== 'Final') { picks.forEach(pick => attempted.add(pick.id)); report.skipped += picks.length; continue }
      const periods = [...new Set(picks.map(pick => nbaPeriod(pick.pick_type)))], results = await Promise.allSettled(periods.map(period => getPaintFinalStats(Number(id), period)))
      const stats = results.flatMap((result, index) => { if (result.status === 'fulfilled' && result.value.complete) return result.value.rows; report.issues.push(`NBA period ${periods[index]} final stats incomplete`); return [] })
      factsReady = true
      for (const pick of picks) {
        if (rpcBudget() <= 0) { report.skipped++; report.issues.push('NBA time budget reached'); continue }
        attempted.add(pick.id)
        report.checked++
        const result = gradeNbaPick(pick, stats)
        if (!result) { report.skipped++; completed.add(pick.id); continue }
        try {
          const writeBudget = rpcBudget()
          if (writeBudget <= 0) { report.skipped++; report.issues.push('NBA time budget reached'); completed.add(pick.id); continue }
          // An aborted response is uncertain: the transaction may have committed.
          // Never retry it here; the next scheduled scan and atomic RPC reconcile it.
          const applied = await admin.rpc('settle_nba_pick_exact', { p_pick_id: pick.id, p_result: result }).abortSignal(AbortSignal.timeout(writeBudget))
          if (applied.error) { report.skipped++; report.issues.push('NBA atomic settlement failed') }
          else if (applied.data === true) { report.graded++; report.graded_ids.push(pick.id) }
        } catch { report.skipped++; report.issues.push('NBA atomic settlement failed') }
        completed.add(pick.id)
      }
    } catch {
      if (!factsReady) picks.forEach(pick => attempted.add(pick.id))
      report.skipped += picks.filter(pick => !completed.has(pick.id)).length
      report.issues.push('NBA final data unavailable')
    }
    finally {
      // Only work actually attempted advances the rotation. A large batch can
      // outlive this invocation; unvisited games/picks must lead the next scan.
      if (attempted.size) {
        report.attempted += attempted.size
        try {
          const checkedAt = new Date().toISOString()
          const checkpointBudget = Math.min(checkpointReserve, deadline - Date.now())
          if (checkpointBudget <= 0) report.issues.push('NBA attempt checkpoint failed')
          else {
            const checkpoint = await admin.from('nba_settlement_attempts').upsert([...attempted].map(pick_id => ({ pick_id, checked_at: checkedAt })), { onConflict: 'pick_id' }).abortSignal(AbortSignal.timeout(checkpointBudget))
            if (checkpoint.error) report.issues.push('NBA attempt checkpoint failed')
          }
        } catch { report.issues.push('NBA attempt checkpoint failed') }
      }
    }
  }
  report.issues = [...new Set(report.issues)]
  return report
}
