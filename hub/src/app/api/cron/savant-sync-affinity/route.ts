import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncAffinityData } from '@/lib/affinitySync'

export const revalidate = 0
export const maxDuration = 60

// Runs daily alongside the other savant-sync-* crons (see vercel.json).
// Small, fast full-replace sync — Savant's affinity CSVs are ~400 players
// and ~150-160k match-score rows per side, well within one invocation,
// unlike the pitch-log sync which has to page across a full season.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const result = await syncAffinityData(admin)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
