import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import Link from 'next/link'
import { TrendingUp, Flame, Users, Hash } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import { PostCardClient } from '@/components/social/PostCardClient'
import { UserBadges } from '@/components/social/UserBadges'
import { FollowButton } from '@/components/social/FollowButton'

export const revalidate = 300

// Same shape every other real post listing (Feed/Hashtag/Bookmarks/Picks)
// queries with — Explore previously hand-rolled its own thin post cards
// (plain hearts, no real reactions/comments/badges, no click-through),
// which is why it looked and behaved nothing like the rest of the site.
const POST_WITH_AUTHOR = `*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)`

type ExploreUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  account_type: string
  follower_count: number
  pick_record: { wins: number; losses: number } | null
}

export default async function ExplorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: topCappers }, { data: topBettors }, { data: rawTopPosts }, { data: rawTrendingPicks }] = await Promise.all([
    // "Capper" is this site's term for a creator account specifically (see
    // register/onboarding) — filtered by account_type so this section can
    // only ever show real cappers, never a mislabeled regular member.
    supabase.from('users')
      .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
      .eq('is_active_member', true)
      .eq('account_type', 'creator')
      .order('follower_count', { ascending: false })
      .limit(6),
    // Everyone else — the site's actual "bettor" role — shown as its own,
    // correctly-labeled section instead of being lumped in under "Cappers".
    supabase.from('users')
      .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
      .eq('is_active_member', true)
      .neq('account_type', 'creator')
      .order('follower_count', { ascending: false })
      .limit(6),
    supabase.from('posts')
      .select(POST_WITH_AUTHOR)
      .eq('visibility', 'public')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('reaction_count', { ascending: false })
      .limit(5),
    supabase.from('posts')
      .select(POST_WITH_AUTHOR)
      .eq('post_type', 'pick')
      .eq('visibility', 'public')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('reaction_count', { ascending: false })
      .limit(5),
  ])

  const [topPosts, trendingPicks] = await Promise.all([
    attachUserReactions(rawTopPosts ?? [], user?.id),
    attachUserReactions(rawTrendingPicks ?? [], user?.id),
  ])

  const spotlightUsers = [...(topCappers ?? []), ...(topBettors ?? [])] as ExploreUser[]
  let followingIds = new Set<string>()
  if (user && spotlightUsers.length) {
    const { data: followingRows } = await supabase.from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', spotlightUsers.map(u => u.id))
    followingIds = new Set((followingRows ?? []).map((r: any) => r.following_id))
  }

  const SPORTS = [
    { label: 'MLB', emoji: '⚾', href: '/hashtag/mlb' },
    { label: 'NFL', emoji: '🏈', href: '/hashtag/nfl' },
    { label: 'NBA', emoji: '🏀', href: '/hashtag/nba' },
    { label: 'NHL', emoji: '🏒', href: '/hashtag/nhl' },
    { label: 'Soccer', emoji: '⚽', href: '/hashtag/soccer' },
    { label: 'MMA', emoji: '🥊', href: '/hashtag/mma' },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      {/* Sport categories */}
      <section>
        <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
          <Hash size={14} /> Browse by Sport
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SPORTS.map(s => {
            const logo = sportLogoUrl(s.label)
            return (
              <Link key={s.label} href={s.href}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all">
                {logo ? <img src={logo} alt={s.label} className="w-6 h-6 object-contain shrink-0" /> : <span className="text-xl">{s.emoji}</span>}
                <span className="font-bold text-white text-sm">{s.label}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Trending picks — real post cards, same component Feed uses */}
      {trendingPicks.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> Hot Picks Today
          </h2>
          <div className="space-y-3">
            {trendingPicks.map((p: any, i: number) => <PostCardClient key={p.id} post={p} index={i} />)}
          </div>
        </section>
      )}

      {/* Top posts — real post cards, same component Feed uses */}
      {topPosts.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
            <Flame size={14} /> Top Posts (24h)
          </h2>
          <div className="space-y-3">
            {topPosts.map((p: any, i: number) => <PostCardClient key={p.id} post={p} index={i} />)}
          </div>
        </section>
      )}

      {/* Top cappers — real creator accounts only; hidden entirely once
          none exist yet rather than padding it out with regular members */}
      {(topCappers?.length ?? 0) > 0 && (
        <PeopleSection title="Top Cappers" icon={<Users size={14} />} users={topCappers as ExploreUser[]} currentUserId={user?.id ?? null} followingIds={followingIds} />
      )}

      {/* Top bettors — everyone else, i.e. the vast majority of members */}
      {(topBettors?.length ?? 0) > 0 && (
        <PeopleSection title="Top Bettors" icon={<Users size={14} />} users={topBettors as ExploreUser[]} currentUserId={user?.id ?? null} followingIds={followingIds} />
      )}
    </div>
  )
}

function PeopleSection({ title, icon, users, currentUserId, followingIds }: {
  title: string
  icon: React.ReactNode
  users: ExploreUser[]
  currentUserId: string | null
  followingIds: Set<string>
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-zinc-400 flex items-center gap-2">{icon} {title}</h2>
        <Link href="/leaderboard" className="text-xs text-green-400 hover:text-green-300">See all →</Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
            <Link href={`/profile/${u.username}`} className="shrink-0">
              <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-black text-white overflow-hidden">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <Link href={`/profile/${u.username}`} className="font-bold text-white text-xs truncate hover:underline">
                  {u.display_name || u.username}
                </Link>
                <UserBadges userId={u.id} size={12} />
                {u.is_verified && <span className="text-green-400 text-[10px] shrink-0">✓</span>}
              </div>
              <Link href={`/profile/${u.username}`} className="text-[10px] text-zinc-500 hover:text-zinc-300 block truncate">@{u.username}</Link>
              <p className="text-[10px] text-zinc-500">{u.follower_count ?? 0} followers</p>
              {u.pick_record && (
                <p className="text-[10px] font-bold text-green-400">{u.pick_record.wins}W-{u.pick_record.losses}L</p>
              )}
            </div>
            {currentUserId && currentUserId !== u.id ? (
              <FollowButton currentUserId={currentUserId} targetUserId={u.id} initialFollowing={followingIds.has(u.id)} />
            ) : !currentUserId ? (
              <Link href="/auth/login" className="text-xs font-bold text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-xl transition-colors shrink-0">
                Follow
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
