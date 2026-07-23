import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'

export const revalidate = 0
export const maxDuration = 30

// lineup_confirmed notifications are only ever meaningful for the day
// they fire (a confirmed lineup or a postponed-game alert from a week ago
// is noise, not history) — but every one of the cron's broadcasts has
// stuck around forever, since nothing ever deleted them. Confirmed live:
// 113,515 of the notifications table's 125,756 total rows (90%) were this
// one type, going back 12 days, in a 45MB table. Runs once daily; a
// 3-day window (not 1) is a deliberate buffer against timezone edges and
// anyone who hasn't opened the app in a day or two.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { error, count } = await admin
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('type', 'lineup_confirmed')
    .lt('created_at', cutoff)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: count ?? 0, cutoff })
}
