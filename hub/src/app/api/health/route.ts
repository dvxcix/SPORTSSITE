import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  let healthy = false
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('pipeline_runs').select('id').limit(1)
    healthy = !error
  } catch {
    healthy = false
  }

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database: healthy ? 'reachable' : 'unavailable',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
