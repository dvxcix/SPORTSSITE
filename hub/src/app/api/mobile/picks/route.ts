import { NextResponse } from 'next/server'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { queryOwnPicks } from '@/lib/myPicksQuery'
import { mobilePost } from '@/lib/nativeSocial'
import { attachUserReactions } from '@/lib/queries'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const query = new URL(request.url).searchParams
  const view = query.get('view') ?? 'active', limit = Number(query.get('limit') ?? 50)
  if ((view !== 'active' && view !== 'history') || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: 'Invalid pick filters' }, { status: 400, headers })
  }
  try {
    const allowMlb = await canViewMlb(supabase, userId)
    const posts = await queryOwnPicks(supabase, userId, view, limit + 1, !allowMlb)
    const picks = await attachUserReactions(posts.slice(0, limit), userId, supabase, true)
    return NextResponse.json({ posts: picks.map(mobilePost), hasMore: posts.length > limit }, { headers })
  } catch {
    return NextResponse.json({ error: 'Picks couldn’t load' }, { status: 503, headers })
  }
}
