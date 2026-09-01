import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { analyzeMarketDnaSlate, archiveMarketDnaDate, buildMarketDnaSlate } from '@/lib/marketDna'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 300

const MAX_BACKFILL_DATES = 2
const STRICT_ARCHIVE_START = '2026-07-16'

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

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
    const slate = await buildMarketDnaSlate(todayEt)
    const analysis = await analyzeMarketDnaSlate(todayEt, slate.games)
    const reducer = analysis.games.find(game => game.reducer)?.reducer ?? null
    return NextResponse.json({
      ok: true,
      todayEt,
      stage: 'model-fit',
      modelVersion: reducer?.version ?? null,
      validation: reducer?.validation ?? null,
      gamesAnalyzed: analysis.games.length,
    })
  }

  const admin = createAdminClient()
  const throughDate = shiftDate(todayEt, -1)
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

  const capturedDates = [...new Set(coverage.map(row => row.game_date))].sort()
  const strictDates = new Set(coverage.filter(row => row.source_version === 'canonical-v3-strict-mechanics').map(row => row.game_date))
  const dates = capturedDates.filter(date => !strictDates.has(date)).slice(0, MAX_BACKFILL_DATES)
  const newestCaptured = capturedDates.at(-1)
  if (dates.length < MAX_BACKFILL_DATES) {
    for (let date = shiftDate(newestCaptured ?? throughDate, 1); date <= throughDate && dates.length < MAX_BACKFILL_DATES; date = shiftDate(date, 1)) {
      dates.push(date)
    }
  }

  const archived = await pooled(dates, 2, date => archiveMarketDnaDate(date))
  // Archive reconstruction and model fitting are independently expensive.
  // Keep them in separate cron invocations so neither can consume the other's
  // serverless runtime budget and cap each archive pass to two dates.
  return NextResponse.json({
    ok: true,
    todayEt,
    throughDate,
    stage: 'archive',
    archived,
    modelDeferredToFitStage: true,
    strictDates: strictDates.size + dates.length,
  })
}

export const GET = withPipelineHealth('market-dna-maintenance', run)
