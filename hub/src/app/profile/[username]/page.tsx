import { getUserProfile, getUserPosts, attachUserReactions } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PostCardClient } from '@/components/social/PostCardClient'
import { FollowButton } from '@/components/social/FollowButton'
import { ProfileStats } from '@/components/profile/ProfileStats'
import { UserBadges } from '@/components/social/UserBadges'
import { AchievementsSection } from '@/components/profile/AchievementsSection'
import { FavoritesSection } from '@/components/profile/FavoritesSection'
import { BookLogo } from '@/components/BookLogo'
import { Badge } from '@/components/ui/badge'
import { MapPin, Link as LinkIcon, AtSign, Calendar, TrendingUp, BadgeCheck } from 'lucide-react'
import { PROVIDER_BY_PLATFORM_KEY } from '@/lib/verifiedIdentity'
import type { Metadata } from 'next'

interface Props { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }

export const dynamic = 'force-dynamic'

// Every page previously inherited the root layout's generic site-wide title
// ("SlipSurge — The Social Hub...") — sharing a profile link (a core loop
// for a social app built around showing off your record) unfurled with zero
// context about who it even was. Real name/record/avatar now included.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getUserProfile(username)
  if (!profile) return {}
  const name = profile.display_name || profile.username
  const record = profile.pick_record as { wins?: number; losses?: number; pushes?: number } | null
  const recordStr = record && ((record.wins ?? 0) + (record.losses ?? 0) + (record.pushes ?? 0)) > 0
    ? `${record.wins ?? 0}-${record.losses ?? 0}${record.pushes ? `-${record.pushes}` : ''} record. `
    : ''
  const description = `${recordStr}${profile.bio || `${name}'s picks and posts on SlipSurge.`}`.trim()
  return {
    title: `${name} (@${profile.username}) · SlipSurge`,
    description,
    openGraph: {
      title: `${name} (@${profile.username})`,
      description,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
    twitter: {
      card: 'summary',
      title: `${name} (@${profile.username})`,
      description,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
  }
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'picks', label: 'Picks' },
  { key: 'reposts', label: 'Reposts' },
] as const

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params
  const { tab: tabParam } = await searchParams
  const tab = TABS.some(t => t.key === tabParam) ? tabParam! : 'all'
  const [profile, supabase] = await Promise.all([getUserProfile(username), createClient()])
  if (!profile) notFound()

  const [posts, { data: { user: authUser } }, { count: postsCount }, { count: repostsCount }, { data: achievementRows }, { data: socialPlatforms }] = await Promise.all([
    getUserPosts(profile.id),
    supabase.auth.getUser(),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', profile.id).eq('visibility', 'public'),
    supabase.from('reposts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
    supabase.from('user_badges')
      .select('badge:badges(id, name, description, card_image_url)')
      .eq('user_id', profile.id),
    supabase.from('social_platforms').select('*'),
  ])
  const achievements = (achievementRows ?? [])
    .map((r: any) => r.badge)
    .filter((b: any) => b?.card_image_url)

  // Only the platforms this profile actually connected — a real OAuth-linked
  // identity (verified_identities) takes priority over a manually-typed
  // social_links handle when both exist, since the linked one is provably
  // real and the typed one is just whatever text they entered.
  const connectedAccounts = (socialPlatforms ?? [])
    .map((p: any) => {
      const provider = PROVIDER_BY_PLATFORM_KEY[p.key]
      const verifiedIdentity = provider ? profile.verified_identities?.[provider] : null
      if (verifiedIdentity) {
        return { ...p, handle: verifiedIdentity.handle, href: verifiedIdentity.profileUrl, isVerified: true }
      }
      const manualHandle = profile.social_links?.[p.key]
      if (!manualHandle) return null
      const href = p.url_template ? p.url_template.replace('{handle}', encodeURIComponent(manualHandle.replace(/^@/, ''))) : null
      return { ...p, handle: manualHandle, href, isVerified: false }
    })
    .filter(Boolean)

  const isOwnProfile = authUser?.id === profile.id

  // Check follow status
  let isFollowing = false
  if (authUser && !isOwnProfile) {
    // follows has no `id` column (its PK is the composite
    // follower_id/following_id pair) — selecting 'id' errored on every call,
    // and since the error was never checked, `data` was always null and
    // this always evaluated to false regardless of the real relationship.
    // The button correctly wrote the follow row; only this read was broken,
    // which is why it reverted to "Follow" on every refresh despite the
    // follow having actually persisted.
    const { data } = await supabase.from('follows')
      .select('follower_id').eq('follower_id', authUser.id).eq('following_id', profile.id).maybeSingle()
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
  const allMappedPosts = postsWithReactions.map((p: any) => ({
    ...p,
    user_bookmarked: false,
  }))
  const mappedPosts = tab === 'picks'
    ? allMappedPosts.filter((p: any) => p.post_type === 'pick' || p.post_type === 'parlay')
    : tab === 'reposts'
    ? allMappedPosts.filter((p: any) => p.reposted_by)
    : allMappedPosts

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

          {/* Connected accounts + sportsbooks — a verified badge means the
              handle came from a real, OAuth-linked account (Settings >
              Connected Accounts > Verify), not just typed-in text. */}
          {(connectedAccounts.length > 0 || (profile.sportsbooks?.length ?? 0) > 0) && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {connectedAccounts.map((a: any) => {
                const content = (
                  <span className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-full pl-1.5 pr-2.5 py-1 text-xs font-bold text-zinc-300">
                    <img src={a.icon_url} alt={a.name} className="w-4 h-4 object-contain" />
                    {a.handle}
                    {a.isVerified && <BadgeCheck size={13} className="text-green-500" />}
                  </span>
                )
                return a.href ? (
                  <a key={a.id} href={a.href} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">{content}</a>
                ) : (
                  <span key={a.id}>{content}</span>
                )
              })}
              {(profile.sportsbooks ?? []).map((book: string) => (
                <span key={book} className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-1.5" title={book}>
                  <BookLogo vendor={book} size={14} />
                </span>
              ))}
            </div>
          )}

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

      <AchievementsSection achievements={achievements} />
      <FavoritesSection teams={profile.favorite_teams ?? []} players={profile.favorite_players ?? []} />

      <div className="border-t border-zinc-800" />

      {/* Tabs */}
      <div className="flex px-2">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={t.key === 'all' ? `/profile/${username}` : `/profile/${username}?tab=${t.key}`}
            className={`flex-1 text-center text-sm font-bold py-3 border-b-2 transition-colors ${
              tab === t.key ? 'text-white border-green-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Posts */}
      <div className="px-4 py-4 space-y-3">
        {mappedPosts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-zinc-400 font-medium">
              {tab === 'picks' ? 'No picks posted yet' : tab === 'reposts' ? 'Nothing reposted yet' : 'No posts yet'}
            </p>
            {isOwnProfile && tab === 'all' && (
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
