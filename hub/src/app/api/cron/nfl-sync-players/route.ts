import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflPlayers } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 120

// players.csv covers every player in nflverse's history (~25k+ rows) in one
// file — a full daily re-upsert is simpler and more reliable than tracking
// which specific players changed, and nflverse republishes the whole file
// nightly anyway so there's no way to fetch just a delta.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const count = await syncNflPlayers(admin)
    return NextResponse.json({ synced: count })
  } catch (e: any) {
    console.error('[nfl-sync-players] failed', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
