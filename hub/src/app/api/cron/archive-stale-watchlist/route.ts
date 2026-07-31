import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'

export const revalidate = 0
export const maxDuration = 30

// Nothing ever moved a pending watchlist item off 'pending' once its game
// finished — confirmed live: a member's account still had pending items
// for games 12 days gone, and both the Watchlist panel's own pendingCount
// badge and the new Watchlist share-image (see api/share-image/watchlist)
// pull directly off status='pending', so both silently accumulated every
// pick anyone ever added and never explicitly posted or removed. Runs once
// daily, well before the day's first pitch — flips status to 'archived'
// (an existing WatchlistItem status, not a new one) for any pending item
// whose game_date has already passed, using ET (the same timezone every
// other date-strip/cutover in this app already keys off) so a late-night
// item for tonight's game doesn't get archived prematurely around midnight
// UTC.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const { error, count } = await admin
    .from('watchlist_items')
    .update({ status: 'archived' }, { count: 'exact' })
    .eq('status', 'pending')
    .lt('game_date', today)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, archived: count ?? 0, today })
}
