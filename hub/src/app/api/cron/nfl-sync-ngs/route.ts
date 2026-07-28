import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflNgsPassing, syncNflNgsReceiving, syncNflNgsRushing } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 60

// All three Next Gen Stats categories in one cron — each combined file is
// small (well under 15k rows), so there's no real benefit to splitting
// these into three separate routes the way the much bigger player_stats/
// pbp syncs might eventually warrant.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const [passing, receiving, rushing] = await Promise.all([
      syncNflNgsPassing(admin),
      syncNflNgsReceiving(admin),
      syncNflNgsRushing(admin),
    ])
    return NextResponse.json({ passing, receiving, rushing })
  } catch (e: any) {
    console.error('[nfl-sync-ngs] failed', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
