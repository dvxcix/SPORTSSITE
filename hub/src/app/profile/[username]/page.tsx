import { getUserProfile, attachUserReactions } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { isBlockedEitherWay } from '@/lib/blocks'
import { fetchProfilePostsPage, type ProfileTab } from '@/lib/feedQuery'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProfilePostList } from '@/components/social/ProfilePostList'
import { FollowButton } from '@/components/social/FollowButton'
import { BlockUserButton } from '@/components/social/BlockUserButton'
import { ProfileStats } from '@/components/profile/ProfileStats'
import { UserBadges } from '@/components/social/UserBadges'
import { AchievementsSection } from '@/components/profile/AchievementsSection'
import { FavoritesSection } from '@/components/profile/FavoritesSection'
import { ProfileActions } from '@/components/profile/ProfileActions'
import { BookLogo } from '@/components/BookLogo'
import { Badge } from '@/components/ui/badge'
import { MapPin, Link as LinkIcon, AtSign, Calendar, BadgeCheck, Store, Users, Sparkles, ArrowRight } from 'lucide-react'
import { PROVIDER_BY_PLATFORM_KEY } from '@/lib/verifiedIdentity'
import { hasCreatorAccess } from '@/lib/creator'
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
  const tab: ProfileTab = TABS.some(t => t.key === tabParam) ? (tabParam as ProfileTab) : 'all'
  const [profile, supabase] = await Promise.all([getUserProfile(username), createClient()])
  if (!profile) notFound()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  const isOwnProfile = authUser?.id === profile.id

  // Checked before any of the heavier posts/achievements/social-platform
  // fetches below — a block (either direction) means neither party should
  // see anything of the other's profile at all, not just posts, matching
  // every mainstream app's "account unavailable" treatment rather than the
  // private-account behavior (which still shows avatar/bio/follower counts).
  const isBlocked = !isOwnProfile && !!authUser && await isBlockedEitherWay(supabase, authUser.id, profile.id)
  if (isBlocked) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <p className="text-4xl mb-3">🚫</p>
        <p className="text-white font-bold">This profile isn't available</p>
        <p className="text-zinc-500 text-sm mt-1">You or @{profile.username} have blocked each other.</p>
      </div>
    )
  }

  const [{ posts: rawPosts, nextCursor, hasMore }, { count: postsCount }, { count: repostsCount }, { data: achievementRows }, { data: socialPlatforms }, { data: creatorApproval }, { data: creatorGroups }, { data: creatorProducts }] = await Promise.all([
    fetchProfilePostsPage(supabase, { userId: profile.id, tab, pageSize: 20 }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', profile.id),
    supabase.from('reposts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
    supabase.from('user_badges')
      .select('badge:badges(id, name, description, icon_url, card_image_url)')
      .eq('user_id', profile.id),
    supabase.from('social_platforms').select('*'),
    supabase.from('creator_applications').select('id').eq('user_id', profile.id).eq('status', 'approved').maybeSingle(),
    supabase.from('groups').select('id,name,slug,emoji,member_count,access_type').eq('owner_id', profile.id).eq('is_public', true).order('created_at', { ascending: false }).limit(6),
    supabase.from('creator_products').select('id,title,description,price,product_type,status').eq('creator_id', profile.id).eq('status', 'active').order('created_at', { ascending: false }).limit(6),
  ])
  const isCreatorProfile = hasCreatorAccess(profile.account_type, Boolean(creatorApproval))
  const achievements = (achievementRows ?? []).map((r: any) => r.badge).filter(Boolean)

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

  // Private account = only the owner or a follower can see the actual
  // content (posts/picks) — profile info (avatar, username, bio, follower
  // counts) stays visible either way, same as any mainstream app's private
  // account. Pick Record/Win Rate now follows the same rule (a private
  // account's stats are content too — a non-follower shouldn't see the W/L
  // record just because the individual picks are hidden), on top of
  // hide_win_rate, which is a SEPARATE opt-out a public account can also use
  // to hide just that one stat without going private.
  const canViewContent = isOwnProfile || !profile.is_private || isFollowing
  const canViewWinRate = isOwnProfile || (canViewContent && !profile.hide_win_rate)

  // Map posts to PostCardClient shape. `author` comes straight from the
  // query now (fetchProfilePostsPage embeds it per-post) rather than being
  // forced to this profile's own info — that forcing was wrong for reposts,
  // where the post's real author is whoever originally posted it, not this
  // profile. Tab filtering (picks/reposts) now happens at the query level
  // inside fetchProfilePostsPage instead of here, so pagination stays
  // consistent per tab instead of paginating an unfiltered set and filtering
  // after the fact.
  const postsWithReactions = await attachUserReactions(rawPosts, authUser?.id)
  const mappedPosts = postsWithReactions.map((p: any) => ({
    ...p,
    user_bookmarked: false,
  }))

  return (
    <main className="mx-auto w-full max-w-5xl px-3 pb-28 pt-3 sm:px-5 sm:pt-5">
      <div className="overflow-hidden rounded-[28px] border border-white/[.08] bg-[#0b0d10] shadow-[0_30px_100px_rgba(0,0,0,.4)]">
      {/* Banner */}
      <div className="h-44 sm:h-60 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 relative overflow-hidden">
        {profile.banner_url && <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />}
        {!profile.banner_url && (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(163,230,53,.22),transparent_42%),linear-gradient(135deg,#172015,#090b0e_65%)]" />
        )}
      </div>

      {/* Profile header */}
      <div className="px-4 pb-5 sm:px-7 sm:pb-7">
        <div className="relative z-10 flex items-end justify-between -mt-12 sm:-mt-16 mb-5">
          <div className="relative avatar-glow-ring w-24 h-24 sm:h-32 sm:w-32 rounded-full">
            <div className="w-full h-full rounded-full bg-zinc-700 border-4 border-zinc-950 flex items-center justify-center text-3xl font-black text-white overflow-hidden shadow-xl">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : (profile.display_name || profile.username)[0].toUpperCase()
              }
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ProfileActions username={profile.username} />
            {isOwnProfile ? (
            <a href="/settings/profile"
              className="inline-flex items-center h-9 px-4 text-sm rounded-xl border border-zinc-700 text-white hover:bg-zinc-800 font-bold transition-colors">
              Edit Profile
            </a>
          ) : authUser ? (
            <div className="flex items-center gap-2">
              <FollowButton
                currentUserId={authUser.id}
                targetUserId={profile.id}
                initialFollowing={isFollowing}
              />
              <BlockUserButton
                currentUserId={authUser.id}
                targetUserId={profile.id}
                targetUsername={profile.username}
                initialBlocked={false}
                variant="button"
              />
            </div>
          ) : (
            <a href="/auth/login"
              className="inline-flex items-center h-9 px-4 text-sm rounded-xl bg-green-500 hover:bg-green-400 text-black font-black transition-colors">
              Follow
            </a>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{profile.display_name || profile.username}</h1>
            <UserBadges userId={profile.id} size={20} maxVisible={6} badges={achievements} />
            {profile.is_verified && <span className="text-green-400 text-sm">✓</span>}
            {isCreatorProfile && (
              <span className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">CREATOR</span>
            )}
          </div>
          <p className="text-sm text-zinc-500">@{profile.username}</p>

          {profile.bio && <p className="max-w-2xl text-[15px] text-zinc-300 leading-7">{profile.bio}</p>}
          {isOwnProfile && !profile.bio && <Link href="/settings/profile" className="inline-flex max-w-xl items-center gap-2 rounded-xl border border-dashed border-lime-400/25 bg-lime-400/[.04] px-3 py-2 text-xs font-bold text-zinc-400 hover:text-lime-300"><Sparkles size={14} /> Add a bio so people know what you cover</Link>}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-zinc-400">
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
            ...(total > 0 && canViewWinRate ? [
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

      {isCreatorProfile && (
        <section className="mx-4 mb-5 overflow-hidden rounded-2xl border border-lime-400/20 bg-gradient-to-br from-lime-400/[0.08] via-zinc-950 to-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="flex flex-col gap-4 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-lime-400/25 bg-lime-400/10 text-lime-300"><Store size={18} /></span><div><p className="text-[10px] font-black tracking-[0.18em] text-lime-300">CREATOR COMMUNITY</p><h2 className="text-base font-black text-white">Join {profile.display_name || profile.username}</h2></div></div>
            <div className="flex gap-2">{isOwnProfile && <Link href="/creators/studio" className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-lime-400/40 hover:text-white"><Sparkles size={14} /> Creator Studio</Link>}<Link href={`/creators/${profile.username}`} className="inline-flex items-center gap-1.5 rounded-xl bg-lime-400 px-3 py-2 text-xs font-black text-zinc-950 hover:bg-lime-300">View storefront <ArrowRight size={14} /></Link></div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {(creatorProducts ?? []).map(product => <Link href={`/creators/offers/${product.id}`} key={product.id} className="rounded-xl border border-white/[0.08] bg-black/25 p-3 hover:border-lime-400/30 hover:bg-lime-400/[0.04]"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-white">{product.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{product.description || 'Premium creator access on SlipSurge.'}</p></div><strong className="whitespace-nowrap text-sm text-lime-300">${Number(product.price).toFixed(2)}</strong></div></Link>)}
            {(creatorGroups ?? []).map(group => <Link href={`/groups/${group.slug}`} key={group.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-3 hover:border-lime-400/30 hover:bg-lime-400/[0.04]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zinc-900 text-lg">{group.emoji || <Users size={16} />}</span><div className="min-w-0"><p className="truncate text-sm font-black text-white">{group.name}</p><p className="text-xs text-zinc-500">{group.member_count ?? 0} members · {group.access_type === 'paid' ? 'Member access' : 'Open community'}</p></div></Link>)}
            {(creatorProducts?.length ?? 0) === 0 && (creatorGroups?.length ?? 0) === 0 && <div className="sm:col-span-2 rounded-xl border border-dashed border-zinc-800 p-5 text-center text-xs text-zinc-500">This creator is setting up their first community and membership.</div>}
          </div>
        </section>
      )}

      <AchievementsSection achievements={achievements} />
      <FavoritesSection teams={profile.favorite_teams ?? []} players={profile.favorite_players ?? []} />

      <div className="border-t border-white/[.07]" />

      {canViewContent ? (
        <>
          {/* Tabs */}
          <div className="flex px-2 sm:px-5">
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
          <div className="px-3 py-4 sm:px-6 sm:py-6">
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
              <ProfilePostList
                userId={profile.id}
                tab={tab}
                initialPosts={mappedPosts}
                initialCursor={nextCursor}
                initialHasMore={hasMore}
              />
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16 px-4">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-white font-bold">This account is private</p>
          <p className="text-zinc-500 text-sm mt-1">Follow @{profile.username} to see their posts and picks.</p>
        </div>
      )}
      </div>
    </main>
  )
}
