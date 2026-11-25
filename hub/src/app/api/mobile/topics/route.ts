import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { requireVerifiedUserTier } from '@/lib/requireTier'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { POST_WITH_AUTHOR } from '@/lib/feedQuery'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { attachUserReactions } from '@/lib/queries'
import { hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'
import { mobilePost } from '@/lib/nativeSocial'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const access = await requireVerifiedUserTier(account.userId, 'basic')
  if (access.error) return access.error
  const params = new URL(request.url).searchParams
  const tags = params.getAll('tag')
  if (tags.length !== 1 || !/^[a-zA-Z0-9_-]{1,50}$/.test(tags[0])) return respond({ error: 'Invalid topic' }, 400)
  const tag = tags[0]

  try {
    const { supabase, userId } = account
    const [showMlb, excluded] = await Promise.all([
      canViewMlb(supabase, userId),
      getBlockedEitherWayIds(supabase, userId),
    ])
    if (!showMlb && tag.toUpperCase() === 'MLB') return respond({ error: 'Topic unavailable' }, 404)
    const literal = tag.replaceAll('_', '\\_')
    let query = supabase.from('posts').select(POST_WITH_AUTHOR).eq('visibility', 'public')
      .or(`sport.ilike.${literal},content.ilike.%${literal}%,content.ilike.%#${literal}%`)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30)
    if (excluded.length) query = query.not('author_id', 'in', `(${excluded.join(',')})`)
    const { data, error } = await query
    if (error) throw Error()
    const visible = (data ?? []).filter(post => showMlb || post.sport?.toUpperCase() !== 'MLB')
    const enriched = await attachUserReactions(visible, userId, supabase, true)
    const { posts } = await hydrateVisibleAuthorRecords(supabase, enriched)
    return respond({ tag, posts: posts.map(mobilePost) })
  } catch {
    return respond({ error: 'Topic posts are temporarily unavailable' }, 503)
  }
}
