import { NextResponse } from 'next/server'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { exploreSpotlightMembers } from '@/lib/exploreActiveMembers'
import { POST_WITH_AUTHOR } from '@/lib/feedQuery'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { nbaToday } from '@/lib/nbaPaint'
import { mobilePost } from '@/lib/nativeSocial'
import { attachUserReactions } from '@/lib/queries'
import { requireVerifiedUserTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const actor = await requireNativeAccount(request)
  if (actor.error) return actor.error
  const { supabase, userId } = actor
  const tier = await requireVerifiedUserTier(userId, 'basic')
  if (tier.error) return tier.error

  try {
    const [showMlb, blocked] = await Promise.all([
      canViewMlb(supabase, userId),
      getBlockedEitherWayIds(supabase, userId),
    ])
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
    const postRail = () => supabase.from('posts').select(POST_WITH_AUTHOR).eq('visibility', 'public')
      .gte('created_at', dayAgo)
      .order('reaction_count', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(3)
    const [rawPicks, rawPosts, groups, leaders, members] = await Promise.all([
      postRail().eq('post_type', 'pick'),
      postRail(),
      supabase.from('groups').select('id,slug,name,description,avatar_url,emoji,sport,member_count').eq('is_public', true)
        .order('member_count', { ascending: false }).limit(4),
      exploreSpotlightMembers(supabase, true),
      exploreSpotlightMembers(supabase, false),
    ])
    if ([rawPicks, rawPosts, groups].some(result => result.error)) throw Error()
    const excluded = new Set(blocked)
    const sportVisible = (sport: string | null | undefined) => showMlb || sport?.trim().toUpperCase() !== 'MLB'
    const visible = (rows: NonNullable<typeof rawPicks.data>) =>
      rows.filter(row => !excluded.has(row.author_id) && sportVisible(row.sport))
    const picks = visible(rawPicks.data ?? []), posts = visible(rawPosts.data ?? [])
    const unique = [...new Map([...picks, ...posts].map(post => [post.id, post])).values()]
    const identities = [...leaders, ...members].filter(member => !excluded.has(member.id))
    const [feed, following] = await Promise.all([
      attachUserReactions(unique, userId, supabase, true),
      identities.length ? supabase.from('follows').select('following_id').eq('follower_id', userId)
        .in('following_id', identities.map(member => member.id)) : { data: [], error: null },
    ])
    if (following.error) throw Error()
    const { posts: hydrated } = await hydrateVisibleAuthorRecords(supabase, feed)
    const cards = new Map(hydrated.map(row => [row.id, mobilePost(row)]))
    const follows = new Set((following.data ?? []).map(row => row.following_id))
    const spotlight = (people: typeof leaders) => people.filter(member => !excluded.has(member.id))
      .map(member => ({ ...member, following: follows.has(member.id), own: member.id === userId }))
    return respond({
      date: nbaToday(),
      sports: [...(!MLB_HIBERNATING ? ['MLB'] : []), 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA'],
      trendingPicks: picks.flatMap(row => cards.get(row.id) ?? []),
      trendingPosts: posts.flatMap(row => cards.get(row.id) ?? []),
      groups: (groups.data ?? []).filter(row => sportVisible(row.sport)).map(row => ({
        ...row, path: `/groups/${encodeURIComponent(row.slug)}`, count: row.member_count,
      })),
      pages: [],
      creators: spotlight(leaders),
      members: spotlight(members),
    })
  } catch {
    return respond({ error: 'Explore is temporarily unavailable' }, 503)
  }
}
