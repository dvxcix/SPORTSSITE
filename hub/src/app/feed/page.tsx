import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { FeedComposer } from '@/components/social/FeedComposer'
import { PostCardClient } from '@/components/social/PostCardClient'
import { StoriesBar } from '@/components/social/StoriesBar'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { SuggestedUsers } from '@/components/social/SuggestedUsers'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { Zap, TrendingUp, Clock, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record)`

// Reposts previously had zero effect on the feed — nothing here ever
// queried the `reposts` table, so a repost only ever bumped a counter on
// the original post and never appeared as its own timeline entry to
// anyone. Reposts are now fetched alongside authored posts and merged in
// (annotated with reposted_by/repost_created_at, same shape PostCardClient
// already understands from the profile page), timeline-sorted by whichever
// timestamp is relevant. "Following" was also fully non-functional — it had
// no filter branch at all and silently fell through to showing everyone's
// posts — now actually filters to people the viewer follows.
async function getPosts(filter: string, userId: string | null | undefined) {
  const supabase = await createClient()

  let followedIds: string[] | null = null
  if (filter === 'following') {
    if (!userId) return []
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
    followedIds = (data ?? []).map((f: any) => f.following_id)
    if (followedIds.length === 0) return []
  }

  let postQuery = supabase.from('posts').select(POST_WITH_AUTHOR).eq('visibility', 'public').limit(30)
  if (filter === 'picks') postQuery = postQuery.in('post_type', ['pick', 'parlay'])
  if (followedIds) postQuery = postQuery.in('author_id', followedIds)
  postQuery = filter === 'top'
    ? postQuery.order('reaction_count', { ascending: false })
    : postQuery.order('created_at', { ascending: false })

  let repostQuery = supabase
    .from('reposts')
    .select(`created_at, reposted_by:users!reposts_user_id_fkey(username, display_name, avatar_url), post:posts(${POST_WITH_AUTHOR})`)
    .order('created_at', { ascending: false })
    .limit(30)
  if (followedIds) repostQuery = repostQuery.in('user_id', followedIds)

  const [{ data: rawPosts }, { data: repostRows }] = await Promise.all([postQuery, repostQuery])

  let reposted = ((repostRows ?? []) as any[])
    .filter(r => r.post && r.post.visibility === 'public')
    .map(r => ({ ...r.post, reposted_by: r.reposted_by, repost_created_at: r.created_at }))
  if (filter === 'picks') reposted = reposted.filter(p => p.post_type === 'pick' || p.post_type === 'parlay')

  const merged = [...(rawPosts ?? []), ...reposted]
  if (filter === 'top') {
    merged.sort((a: any, b: any) => (b.reaction_count ?? 0) - (a.reaction_count ?? 0))
  } else {
    merged.sort((a: any, b: any) =>
      new Date(b.repost_created_at ?? b.created_at).getTime() - new Date(a.repost_created_at ?? a.created_at).getTime())
  }
  return merged.slice(0, 30)
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter = 'latest' } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [rawPosts, storiesEnabled] = await Promise.all([
    getPosts(filter, user?.id),
    isFeatureEnabledServer(FEATURE_FLAGS.stories),
  ])
  const posts = await attachUserReactions(rawPosts, user?.id)

  // Only fetched when actually needed — an empty feed (most commonly the
  // "Following" tab for someone who hasn't followed anyone yet) previously
  // just showed static text with no way forward. RightSidebar already
  // solves this on desktop, but it's hidden below the xl breakpoint, so
  // mobile — most of a real user base — saw nothing at all.
  let suggested: any[] = []
  if (posts.length === 0 && user) {
    const { data: following } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    const exclude = [...(following ?? []).map((f: any) => f.following_id), user.id]
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified, account_type')
      .not('id', 'in', `(${exclude.join(',') || user.id})`)
      .order('follower_count', { ascending: false })
      .limit(5)
    suggested = data ?? []
  }

  const filters = [
    { key: 'latest', label: 'Latest', icon: Clock },
    { key: 'top', label: 'Top', icon: TrendingUp },
    { key: 'picks', label: 'Picks', icon: Zap },
    { key: 'following', label: 'Following', icon: Users },
  ]

  return (
    <div className="flex gap-6 px-4 py-6 max-w-5xl mx-auto">
      <div className="flex-1 min-w-0">
        {/* Stories — admin's Feature Flags toggle saved to site_settings but
            nothing ever read it back out, so turning "Stories" off there had
            zero effect on this bar. */}
        {storiesEnabled && <StoriesBar />}

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {filters.map(f => {
            const Icon = f.icon
            return (
              <a
                key={f.key}
                href={`/feed?filter=${f.key}`}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  filter === f.key
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon size={12} />
                {f.label}
              </a>
            )
          })}
        </div>

        {/* Post composer */}
        <div className="mb-4">
          <FeedComposer />
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <div className="py-10">
            <div className="text-center mb-6">
              <p className="text-4xl mb-3">🏟️</p>
              <p className="text-zinc-400 font-medium">
                {filter === 'following' ? "No posts from people you follow yet" : filter === 'picks' ? 'No picks posted yet' : 'No posts yet'}
              </p>
              <p className="text-zinc-600 text-sm mt-1">
                {filter === 'following' ? 'Follow some bettors to see their picks here' : 'Be the first to drop a pick'}
              </p>
            </div>
            {suggested.length > 0 && (
              <div className="max-w-sm mx-auto bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={14} className="text-blue-400" />
                  <span className="text-sm font-black text-white">Who to follow</span>
                </div>
                <SuggestedUsers users={suggested} currentUserId={user?.id ?? null} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post, i) => (
              // A post can appear more than once (the original + someone's
              // repost of it, or several people's reposts of it) — key on
              // the repost identity too so React doesn't collide them.
              <PostCardClient key={post.reposted_by ? `repost-${post.id}-${post.reposted_by.username}` : post.id} post={post} index={i} />
            ))}
          </div>
        )}
      </div>

      <RightSidebar />
    </div>
  )
}
