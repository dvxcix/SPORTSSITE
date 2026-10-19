import 'server-only'
import type { createAdminClient } from './supabase/admin'
import { getPaintGame, getPaintFinalStats } from './nbaPaintData'
import { gradeNbaPick, type NbaPendingPick } from './nbaPickGrading'
import { nbaPeriod, nbaToday } from './nbaPaint'

export async function settleNbaPicks(admin: ReturnType<typeof createAdminClient>, deadline = Date.now() + 48_000) {
  const report = { checked: 0, graded: 0, skipped: 0, graded_ids: [] as string[], issues: [] as string[] }
  const { data, error } = await admin.from('picks').select('id,post_id,game_pk,player_id,player_name,pick_type,market_side,numeric_line').eq('sport', 'NBA').eq('result', 'pending').not('game_pk', 'is', null).not('player_id', 'is', null).lte('game_date', nbaToday()).order('created_at').limit(200)
  if (error) { report.issues.push('NBA pending picks unavailable'); return report }
  const groups = new Map<string, NbaPendingPick[]>()
  for (const pick of (data ?? []) as NbaPendingPick[]) groups.set(pick.game_pk, [...(groups.get(pick.game_pk) ?? []), pick])
  for (const [id, picks] of groups) {
    // A fresh game request and at most two stat pages each cap at 12 seconds.
    if (Date.now() + 37_000 > deadline) { report.skipped += picks.length; report.issues.push('NBA time budget reached'); continue }
    try {
      if (!/^\d{1,10}$/.test(id)) { report.skipped += picks.length; continue }
      const game = await getPaintGame(Number(id), true)
      if (game.status_state !== 'final' && game.status !== 'Final') { report.skipped += picks.length; continue }
      const periods = [...new Set(picks.map(pick => nbaPeriod(pick.pick_type)))], results = await Promise.allSettled(periods.map(period => getPaintFinalStats(Number(id), period)))
      const stats = results.flatMap((result, index) => { if (result.status === 'fulfilled' && result.value.complete) return result.value.rows; report.issues.push(`NBA period ${periods[index]} final stats incomplete`); return [] })
      for (const pick of picks) {
        if (Date.now() > deadline - 2_000) { report.skipped++; continue }
        report.checked++
        const result = gradeNbaPick(pick, stats)
        if (!result) { report.skipped++; continue }
        const applied = await admin.rpc('settle_nba_pick_exact', { p_pick_id: pick.id, p_result: result })
        if (applied.error) { report.skipped++; report.issues.push('NBA atomic settlement failed'); continue }
        if (applied.data === true) { report.graded++; report.graded_ids.push(pick.id) }
      }
    } catch { report.skipped += picks.length; report.issues.push('NBA final data unavailable') }
  }
  report.issues = [...new Set(report.issues)]
  return report
}
