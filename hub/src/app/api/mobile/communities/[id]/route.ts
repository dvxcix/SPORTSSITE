import { NextResponse } from 'next/server'
import { groupFeedPage } from '@/lib/groupFeed'
import { InvalidFeedCursorError } from '@/lib/feedPagination'
import { isAccountId } from '@/lib/blocks'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { mobilePost } from '@/lib/nativeSocial'

type Context = { params: Promise<{ id: string }> }
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { id } = await context.params
  if (!isAccountId(id)) return response({ error: 'Community unavailable' }, 404)
  try {
    const { supabase, userId } = account
    const [group, member, showMlb] = await Promise.all([
      supabase.from('groups').select('id,sport,is_public,access_type,owner_id').eq('id', id).maybeSingle(),
      supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', userId).maybeSingle(),
      canViewMlb(supabase, userId),
    ])
    if (group.error || member.error) throw new Error('Community access could not be checked')
    if (!group.data || !showMlb && group.data.sport?.toUpperCase() === 'MLB') return response({ error: 'Community unavailable' }, 404)
    const canView = Boolean(member.data || group.data.is_public && group.data.access_type !== 'paid')
    const query = new URL(request.url).searchParams
    if ((query.get('cursor')?.length ?? 0) > 2048) return response({ error: 'Invalid page cursor' }, 400)
    const feed = canView ? await groupFeedPage(supabase, id, {
      picks: query.get('view') === 'picks', userId, hideMlb: !showMlb, cursor: query.get('cursor'), native: true,
    }) : { posts: [], nextCursor: null, hasMore: false }
    return response({ ...feed, posts: feed.posts.map(mobilePost), canView, role: member.data?.role ?? null,
      canJoin: !member.data && group.data.is_public && group.data.access_type !== 'paid',
      canLeave: Boolean(member.data) && group.data.owner_id !== userId })
  } catch (error) {
    return error instanceof InvalidFeedCursorError ? response({ error: 'Invalid page cursor' }, 400)
      : response({ error: 'Community is temporarily unavailable' }, 503)
  }
}

export async function POST(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { id } = await context.params
  if (!isAccountId(id)) return response({ error: 'Community unavailable' }, 404)
  try {
    const raw = await request.text()
    if (raw.length > 256) return response({ error: 'Invalid membership change' }, 400)
    const body = JSON.parse(raw) as { join?: unknown } | null
    if (typeof body?.join !== 'boolean') return response({ error: 'Invalid membership change' }, 400)
    const { supabase, userId } = account
    const { data: group, error } = await supabase.from('groups').select('sport').eq('id', id).maybeSingle()
    if (error) throw new Error('Community access could not be checked')
    if (!group || group.sport?.toUpperCase() === 'MLB' && !await canViewMlb(supabase, userId)) {
      return response({ error: 'Community unavailable' }, 404)
    }
    const result = await supabase.rpc('set_group_membership', { p_group_id: id, p_join: body.join })
    if (result.error) return response({ error: 'This membership could not be changed' }, 403)
    return response({ member: result.data === true })
  } catch {
    return response({ error: 'Membership could not be confirmed' }, 503)
  }
}
