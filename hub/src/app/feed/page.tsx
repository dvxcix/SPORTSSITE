import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { fetchFeedPage, type FeedFilter } from '@/lib/feedQuery'
import { FeedComposer } from '@/components/social/FeedComposer'
import { FeedList } from '@/components/social/FeedList'
import { StoriesBar } from '@/components/social/StoriesBar'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { SuggestedUsers } from '@/components/social/SuggestedUsers'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { Zap, TrendingUp, Clock, Users } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'

export const dynamic = 'force-dynamic'

const VALID_FILTERS: FeedFilter[] = ['latest', 'top', 'picks', 'following']

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: filterParam = 'latest' } = await searchParams
  const filter: FeedFilter = VALID_FILTERS.includes(filterParam as FeedFilter) ? (filterParam as FeedFilter) : 'latest'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const blockedIds = user ? await getBlockedEitherWayIds(supabase, user.id) : []
  const [{ posts: rawPosts, nextCursor, hasMore }, storiesEnabled] = await Promise.all([
    fetchFeedPage(supabase, { filter, userId: user?.id, blockedIds, pageSize: 20 }),
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
    const exclude = [...(following ?? []).map((f: any) => f.following_id), user.id, ...blockedIds]
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
            <PageState
              compact
              title={filter === 'following' ? 'No posts from people you follow yet' : filter === 'picks' ? 'No picks posted yet' : 'No posts yet'}
              message={filter === 'following' ? 'Follow some bettors to build your feed.' : 'Start the conversation with a new post.'}
              actionLabel={filter === 'following' ? 'Explore members' : undefined}
              actionHref={filter === 'following' ? '/explore' : undefined}
            />
            {suggested.length > 0 && (
              <div className="max-w-sm mx-auto mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={14} className="text-blue-400" />
                  <span className="text-sm font-black text-white">Who to follow</span>
                </div>
                <SuggestedUsers users={suggested} currentUserId={user?.id ?? null} />
              </div>
            )}
          </div>
        ) : (
          <FeedList filter={filter} initialPosts={posts} initialCursor={nextCursor} initialHasMore={hasMore} />
        )}
      </div>

      <RightSidebar />
    </div>
  )
}
