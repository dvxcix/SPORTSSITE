import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  const admin = createAdminClient()
  const { error } = await admin.from('pipeline_runs').select('id').limit(1)
  const healthy = !error

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database: healthy ? 'reachable' : 'unavailable',
      latencyMs: Date.now() - startedAt,
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'local',
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
