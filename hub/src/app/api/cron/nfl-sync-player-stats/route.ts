import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflPlayerStats } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 120

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const count = await syncNflPlayerStats(admin)
    return NextResponse.json({ synced: count })
  } catch (e: any) {
    console.error('[nfl-sync-player-stats] failed', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
