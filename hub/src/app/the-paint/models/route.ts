import { NextResponse } from 'next/server'
import { requirePaintAdmin } from '@/lib/paintAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import type { NbaModelReport } from '@/lib/nbaModel'
export async function GET() {
  const gate = await requirePaintAdmin(); if (gate.error) return gate.error
  try {
    const cached = await nbaSharedCache('model-reports:v1', 300, 300, async () => {
      const admin = createAdminClient()
      const [{ data, error }, summary] = await Promise.all([
        admin.from('nba_model_reports').select('report').eq('version', 'nba-rolling-v1').order('validation_season', { ascending: false }).limit(44),
        admin.rpc('read_nba_research_summary'),
      ])
      if (error || summary.error) throw new Error('NBA validation unavailable')
      const reports = [...new Map((data ?? []).map(row => row.report as NbaModelReport).reverse().map(report => [report.market, report])).values()]
      return { reports, summary: summary.data ?? [] }
    })
    return NextResponse.json({ ...cached.value, fetchedAt: cached.fetchedAt, stale: cached.stale }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'NBA validation could not load' }, { status: 503 }) }
}
