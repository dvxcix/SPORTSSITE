import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { analyzeMarketDnaSlate, archiveMarketDnaDate, buildMarketDnaSlate } from '@/lib/marketDna'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 300

const MAX_BACKFILL_DATES = 4

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

  const admin = createAdminClient()
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const throughDate = shiftDate(todayEt, -1)
  const { data: newest, error: newestError } = await admin
    .from('market_dna_profile_archive')
    .select('game_date')
    .lte('game_date', throughDate)
    .order('game_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (newestError) throw newestError

  const dates: string[] = []
  for (let date = shiftDate(newest?.game_date ?? throughDate, 1); date <= throughDate && dates.length < MAX_BACKFILL_DATES; date = shiftDate(date, 1)) {
    dates.push(date)
  }

  const archived = await pooled(dates, 2, date => archiveMarketDnaDate(date))
  const slate = await buildMarketDnaSlate(todayEt)
  const analysis = await analyzeMarketDnaSlate(todayEt, slate.games)
  const reducer = analysis.games.find(game => game.reducer)?.reducer ?? null

  return NextResponse.json({
    ok: true,
    todayEt,
    throughDate,
    archived,
    modelVersion: reducer?.version ?? null,
    validation: reducer?.validation ?? null,
    gamesAnalyzed: analysis.games.length,
  })
}

export const GET = withPipelineHealth('market-dna-maintenance', run)
