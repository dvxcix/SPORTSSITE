import { getUserProfile, getUserPosts, attachUserReactions } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PostCardClient } from '@/components/social/PostCardClient'
import { FollowButton } from '@/components/social/FollowButton'
import { ProfileStats } from '@/components/profile/ProfileStats'
import { UserBadges } from '@/components/social/UserBadges'
import { Badge } from '@/components/ui/badge'
import { MapPin, Link as LinkIcon, AtSign, Calendar, TrendingUp } from 'lucide-react'

interface Props { params: Promise<{ username: string }> }

export const dynamic = 'force-dynamic'

export default async function ProfilePage({ params }: Props) {
  const { username } = await params
  const [profile, supabase] = await Promise.all([getUserProfile(username), createClient()])
  if (!profile) notFound()

  const [posts, { data: { user: authUser } }, { count: postsCount }, { count: repostsCount }] = await Promise.all([
    getUserPosts(profile.id),
    supabase.auth.getUser(),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', profile.id).eq('visibility', 'public'),
    supabase.from('reposts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
  ])

  const isOwnProfile = authUser?.id === profile.id

  // Check follow status
  let isFollowing = false
  if (authUser && !isOwnProfile) {
    const { data } = await supabase.from('follows')
      .select('id').eq('follower_id', authUser.id).eq('following_id', profile.id).maybeSingle()
    isFollowing = !!data
  }

  const wins = profile.pick_record?.wins ?? 0
  const losses = profile.pick_record?.losses ?? 0
  const total = wins + losses
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0

  // Map posts to PostCardClient shape. `author` comes straight from the
  // query now (getUserPosts embeds it per-post) rather than being forced to
  // this profile's own info — that forcing was wrong for reposts, where the
  // post's real author is whoever originally posted it, not this profile.
  const postsWithReactions = await attachUserReactions(posts, authUser?.id)
  const mappedPosts = postsWithReactions.map((p: any) => ({
    ...p,
    user_bookmarked: false,
  }))

  return (
    <div className="max-w-2xl mx-auto">
      {/* Banner */}
      <div className="h-40 bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 relative overflow-hidden">
        {profile.banner_url && <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />}
        {!profile.banner_url && (
          <div className="absolute inset-0 bg-gradient-to-br from-green-900/30 to-zinc-900" />
        )}
      </div>

      {/* Profile header */}
      <div className="px-4 pb-4">
        <div className="relative z-10 flex items-end justify-between -mt-12 mb-4">
          <div className="relative avatar-glow-ring w-24 h-24 rounded-full">
            <div className="w-full h-full rounded-full bg-zinc-700 border-4 border-zinc-950 flex items-center justify-center text-3xl font-black text-white overflow-hidden shadow-xl">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : (profile.display_name || profile.username)[0].toUpperCase()
              }
            </div>
          </div>
          {isOwnProfile ? (
            <a href="/settings/profile"
              className="inline-flex items-center h-9 px-4 text-sm rounded-xl border border-zinc-700 text-white hover:bg-zinc-800 font-bold transition-colors">
              Edit Profile
            </a>
          ) : authUser ? (
            <FollowButton
              currentUserId={authUser.id}
              targetUserId={profile.id}
              initialFollowing={isFollowing}
            />
          ) : (
            <a href="/auth/login"
              className="inline-flex items-center h-9 px-4 text-sm rounded-xl bg-green-500 hover:bg-green-400 text-black font-black transition-colors">
              Follow
            </a>
          )}
        </div>

        <div className="space-y-2">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-white">{profile.display_name || profile.username}</h1>
            <UserBadges userId={profile.id} size={18} />
            {profile.is_verified && <span className="text-green-400 text-sm">✓</span>}
            {profile.account_type === 'creator' && (
              <span className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">CREATOR</span>
            )}
          </div>
          <p className="text-sm text-zinc-500">@{profile.username}</p>

          {profile.bio && <p className="text-sm text-zinc-300 leading-relaxed">{profile.bio}</p>}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            {profile.location && (
              <span className="flex items-center gap-1"><MapPin size={12} />{profile.location}</span>
            )}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-green-400 hover:underline">
                <LinkIcon size={12} />{profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {profile.twitter_handle && (
              <span className="flex items-center gap-1"><AtSign size={12} />{profile.twitter_handle}</span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={12} />Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* Stats */}
          <ProfileStats stats={[
            { value: String(postsCount ?? 0), label: 'Posts' },
            { value: String(repostsCount ?? 0), label: 'Reposts' },
            { value: String(profile.following_count ?? 0), label: 'Following' },
            { value: String(profile.follower_count ?? 0), label: 'Followers' },
            ...(total > 0 ? [
              { value: `${wins}–${losses}`, label: 'Pick Record', accent: true },
              { value: `${winPct}%`, label: 'Win Rate' },
            ] : []),
          ]} />

          {/* Sport badges */}
          {profile.sport_preferences?.length > 0 && (
            <div className="flex gap-1.5 pt-1 flex-wrap">
              {profile.sport_preferences.map((s: string) => <Badge key={s}>{s}</Badge>)}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800" />

      {/* Posts */}
      <div className="px-4 py-4 space-y-3">
        {mappedPosts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-zinc-400 font-medium">No posts yet</p>
            {isOwnProfile && (
              <p className="text-zinc-600 text-sm mt-1">Share your first pick on the <a href="/feed" className="text-green-400 hover:underline">feed</a></p>
            )}
          </div>
        ) : (
          mappedPosts.map((p: any, i: number) => (
            <PostCardClient key={p.reposted_by ? `repost-${p.id}-${p.reposted_by.username}` : p.id} post={p} index={i} />
          ))
        )}
      </div>
    </div>
  )
}
