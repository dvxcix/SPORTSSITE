import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { archiveMarketDnaDate, fitMarketDnaModel } from '@/lib/marketDna'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import {
  archiveResultComplete, MAX_ARCHIVE_DATES, planArchiveDates, readArchiveSchedule,
  shiftArchiveDate, STRICT_ARCHIVE_START, STRICT_ARCHIVE_VERSION, type ArchiveProgress,
} from '@/lib/marketDnaArchiveProgress'

export const revalidate = 0
export const maxDuration = 600

async function pooled<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results: R[] = []
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) results.push(await task(items[cursor++]))
  }))
  return results
}

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const fitOnly = new URL(req.url).searchParams.get('fitOnly') === '1'
  if (fitOnly) {
    const reducer = await fitMarketDnaModel(todayEt)
    if (!reducer) return NextResponse.json({
      ok: false, deferred: true, stage: 'model-fit', todayEt,
      reason: 'At least 900 prior-date archive rows are required; no synthetic evidence substituted.',
    }, { status: 425 })
    return NextResponse.json({
      ok: true,
      todayEt,
      stage: 'model-fit',
      modelVersion: reducer?.version ?? null,
      validation: reducer?.validation ?? null,
      trainingRows: reducer.trainingRows,
      trainedThrough: reducer.trainedThrough,
    })
  }

  const admin = createAdminClient()
  const throughDate = shiftArchiveDate(todayEt, -1)
  const coverage: Array<{ game_date: string; source_version: string | null }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('market_dna_profile_archive')
      .select('game_date,source_version')
      .gte('game_date', STRICT_ARCHIVE_START)
      .lte('game_date', throughDate)
      .order('game_date', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    const page = (data ?? []) as Array<{ game_date: string; source_version: string | null }>
    coverage.push(...page)
    if (page.length < 1000) break
  }

  const { data: progress, error: progressError } = await admin.from('market_dna_archive_progress')
    .select('game_date,status').eq('source_version', STRICT_ARCHIVE_VERSION)
    .gte('game_date', STRICT_ARCHIVE_START).lte('game_date', throughDate)
    .order('game_date', { ascending: true }).limit(1000)
  if (progressError) throw progressError
  if (progress?.length === 1000) throw new Error('Archive progress range exceeded its bound.')
  const plan = planArchiveDates(coverage, (progress ?? []) as ArchiveProgress[], throughDate)
  const schedule = new Map<string, number[]>()
  // At most two older repair dates plus one bounded forward schedule request.
  const schedules = await Promise.all([
    ...plan.retry.map(date => readArchiveSchedule(date, date)),
    ...(plan.forward.length ? [readArchiveSchedule(plan.forward[0], plan.forward.at(-1)!)] : []),
  ])
  for (const response of schedules) for (const [date, ids] of response) schedule.set(date, ids)
  const candidates = [...plan.retry, ...plan.forward]
  const emptyDates = candidates.filter(date => schedule.get(date)?.length === 0)
  if (emptyDates.some(date => coverage.some(row => row.game_date === date))) {
    throw new Error('Empty schedule conflicts with stored archive evidence; progress was not advanced.')
  }
  const dates = candidates.filter(date => (schedule.get(date)?.length ?? 0) > 0).slice(0, MAX_ARCHIVE_DATES)
  const observedAt = new Date().toISOString()
  const pending = [
    ...emptyDates.map(date => ({ game_date: date, status: 'no_games' as const, scheduled_game_ids: [] as number[] })),
    ...dates.map(date => ({ game_date: date, status: 'incomplete' as const, scheduled_game_ids: schedule.get(date)! })),
  ].map(row => ({ ...row, source_version: STRICT_ARCHIVE_VERSION, archived_game_ids: [] as number[], player_count: 0, observed_at: observedAt }))
  if (pending.length) {
    const { error } = await admin.from('market_dna_archive_progress').upsert(pending, { onConflict: 'game_date,source_version' })
    if (error) throw error
  }

  const archived = await pooled(dates, 2, async date => {
    const result = await archiveMarketDnaDate(date)
    const complete = archiveResultComplete(schedule.get(date)!, result)
    const { error } = await admin.from('market_dna_archive_progress').upsert({
      game_date: date, source_version: STRICT_ARCHIVE_VERSION,
      status: complete ? 'complete' : 'incomplete', scheduled_game_ids: schedule.get(date)!,
      archived_game_ids: result.gameIds, player_count: result.players, observed_at: new Date().toISOString(),
    }, { onConflict: 'game_date,source_version' })
    if (error) throw error
    return { ...result, complete }
  })

  // Archive reconstruction and model fitting are independently expensive.
  // Keep them in separate cron invocations so neither can consume the other's
  // serverless runtime budget and cap each archive pass to two dates.
  return NextResponse.json({
    ok: archived.every(result => result.complete),
    deferred: archived.some(result => !result.complete),
    todayEt,
    throughDate,
    stage: 'archive',
    archived,
    modelDeferredToFitStage: true,
    strictDates: plan.strictDates + archived.filter(result => result.complete && !coverage.some(row => row.game_date === result.date && row.source_version === STRICT_ARCHIVE_VERSION)).length,
    coverage: { scannedDates: candidates.length, emptyDates, completedDates: archived.filter(result => result.complete).map(result => result.date), incompleteDates: archived.filter(result => !result.complete).map(result => result.date) },
    ...(archived.some(result => !result.complete) ? { reason: 'Some scheduled games lack a complete strict archive; dates remain retryable.' } : {}),
  }, { status: archived.some(result => !result.complete) ? 425 : 200 })
}

export const GET = withPipelineHealth('market-dna-maintenance', run)
