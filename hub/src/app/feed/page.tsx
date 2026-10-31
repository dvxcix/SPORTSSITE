import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { authVisibilityUnavailable, getBlockedEitherWayIds } from '@/lib/blocks'
import { fetchFeedPage, feedSport, type FeedFilter } from '@/lib/feedQuery'
import { FeedComposer } from '@/components/social/FeedComposer'
import { FeedList } from '@/components/social/FeedList'
import { StoriesBar } from '@/components/social/StoriesBar'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { SuggestedUsers } from '@/components/social/SuggestedUsers'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import Link from 'next/link'
import { Zap, TrendingUp, Clock, Users, Compass } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export const dynamic = 'force-dynamic'

const VALID_FILTERS: FeedFilter[] = ['latest', 'top', 'picks', 'following']

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sport?: string; game?: string; pick?: string }>
}) {
  const { filter: filterParam = 'latest', sport: sportParam, game, pick } = await searchParams
  const filter: FeedFilter = VALID_FILTERS.includes(filterParam as FeedFilter) ? (filterParam as FeedFilter) : 'latest'
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) throw new Error('Feed is temporarily unavailable')
  const { data: viewer } = user ? await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle() : { data: null }
  const mlbAccess = !MLB_HIBERNATING || viewer?.account_type === 'admin'
  const requestedSport = feedSport(sportParam)
  const sport = requestedSport === 'MLB' && !mlbAccess ? undefined : requestedSport
  const blockedIds = user ? await getBlockedEitherWayIds(supabase, user.id) : []
  const [{ posts: rawPosts, nextCursor, hasMore }, storiesEnabled] = await Promise.all([
    fetchFeedPage(supabase, { filter, userId: user?.id, blockedIds, pageSize: 20, sport, hideMlb: !mlbAccess }),
    isFeatureEnabledServer(FEATURE_FLAGS.stories),
  ])
  const posts = await attachUserReactions(rawPosts, user?.id)

  let suggested: any[] = []
  if (posts.length === 0 && !hasMore && user) {
    const { data: following } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    const exclude = [...(following ?? []).map((f: any) => f.following_id), user.id, ...blockedIds]
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, is_verified, account_type')
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
        <div className="ss-feed-timeline">
          <header className="ss-feed-timeline-head">
            <div>
              <p>COMMUNITY</p>
              <h1 id="feed-title">The Feed</h1>
            </div>
            <Link href="/explore" className="ss-feed-explore"><Compass size={15} /><span>Explore</span></Link>
          </header>
          <nav className="ss-feed-filters" aria-label="Feed filters">
            {filters.map(f => {
              const Icon = f.icon
              return (
                <Link
                  key={f.key}
                  href={`/feed?filter=${f.key}${sport ? `&sport=${sport}` : ''}`}
                  className={`ss-feed-filter ${filter === f.key ? 'is-active' : ''}`}
                  aria-current={filter === f.key ? 'page' : undefined}
                >
                  <Icon size={14} />
                  <span>{f.label}</span>
                </Link>
              )
            })}
          </nav>
          <nav className="ss-feed-filters" aria-label="Feed sports">
            {(['All', ...(mlbAccess ? ['MLB'] : []), 'NFL', 'NBA'] as const).map(league => <Link key={league} href={`/feed?filter=${filter}${league === 'All' ? '' : `&sport=${league}`}`} className={`ss-feed-filter ${(sport ?? 'All') === league ? 'is-active' : ''}`} aria-current={(sport ?? 'All') === league ? 'page' : undefined}>{league}</Link>)}
          </nav>
          {storiesEnabled && <StoriesBar />}

          <div className="ss-feed-composer-wrap">
            <FeedComposer key={`${sport ?? 'all'}:${game ?? ''}:${pick ?? ''}`} preferredSport={sport} initialGameId={game && /^[a-zA-Z0-9_-]{1,80}$/.test(game) ? game : undefined} openPickBuilder={pick === 'true'} />
          </div>

          {posts.length === 0 && !hasMore ? (
            <div className="ss-feed-empty">
              <PageState
                compact
                title={filter === 'following' ? 'No posts from people you follow yet' : filter === 'picks' ? 'No picks posted yet' : 'No posts yet'}
                message={filter === 'following' ? 'Follow some bettors to build your feed.' : 'Start the conversation with a new post.'}
                actionLabel={filter === 'following' ? 'Explore members' : undefined}
                actionHref={filter === 'following' ? '/explore' : undefined}
              />
              {suggested.length > 0 && (
                <div className="ss-feed-empty-suggestions">
                  <div className="ss-feed-empty-suggestions-head">
                    <Users size={14} />
                    <span>Who to follow</span>
                  </div>
                  <SuggestedUsers users={suggested} currentUserId={user?.id ?? null} />
                </div>
              )}
            </div>
          ) : (
            <FeedList key={`${filter}:${sport ?? 'all'}`} filter={filter} sport={sport} initialPosts={posts} initialCursor={nextCursor} initialHasMore={hasMore} viewerId={user?.id ?? null} />
          )}
        </div>
      </section>

      <RightSidebar />
      </div>
    </div>
  )
}
