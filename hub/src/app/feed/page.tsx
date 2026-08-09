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
import Link from 'next/link'
import { Zap, TrendingUp, Clock, Users, Activity, Compass } from 'lucide-react'

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
    <div className="ss-feed-page">
      <div className="ss-feed-layout">
      <section className="ss-feed-primary" aria-labelledby="feed-title">
        <header className="ss-feed-hero">
          <div className="ss-feed-hero-icon" aria-hidden="true"><Activity size={22} /></div>
          <div className="ss-feed-hero-copy">
            <p className="ss-feed-eyebrow"><span>LIVE</span> COMMUNITY PULSE</p>
            <h1 id="feed-title">The Feed</h1>
            <p>Fresh picks, sharp discussion, and market talk from the SlipSurge community.</p>
          </div>
          <Link href="/explore" className="ss-feed-explore"><Compass size={15} /> Explore</Link>
        </header>
        {/* Stories — admin's Feature Flags toggle saved to site_settings but
            nothing ever read it back out, so turning "Stories" off there had
            zero effect on this bar. */}
        {storiesEnabled && <StoriesBar />}

        {/* Filter tabs */}
        <nav className="ss-feed-filters" aria-label="Feed filters">
          {filters.map(f => {
            const Icon = f.icon
            return (
              <Link
                key={f.key}
                href={`/feed?filter=${f.key}`}
                className={`ss-feed-filter ${filter === f.key ? 'is-active' : ''}`}
                aria-current={filter === f.key ? 'page' : undefined}
              >
                <Icon size={14} />
                {f.label}
              </Link>
            )
          })}
        </nav>

        {/* Post composer */}
        <div className="ss-feed-composer-wrap">
          <FeedComposer />
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <div className="ss-feed-empty">
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
          <FeedList filter={filter} initialPosts={posts} initialCursor={nextCursor} initialHasMore={hasMore} />
        )}
      </section>

      <RightSidebar />
      </div>
    </div>
  )
}
