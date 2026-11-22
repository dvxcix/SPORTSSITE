import { getUserProfile, attachUserReactions } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { authVisibilityUnavailable, isBlockedEitherWay } from '@/lib/blocks'
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
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { BookLogo } from '@/components/BookLogo'
import { Badge } from '@/components/ui/badge'
import { MapPin, Link as LinkIcon, AtSign, Calendar, BadgeCheck, Store, Users, Sparkles, ArrowRight, MessageCircle, MessageCircleReply, MessageSquareText, LockKeyhole, UserRoundX, UsersRound } from 'lucide-react'
import { PROVIDER_BY_PLATFORM_KEY } from '@/lib/verifiedIdentity'
import { hasCreatorAccess } from '@/lib/creator'
import type { Metadata } from 'next'
import { SafeImage } from '@/components/ui/SafeImage'
import { LinkifiedText } from '@/components/social/LinkifiedText'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { visibleFavorites } from '@/lib/visibleFavorites'
import { profileMetadata } from '@/lib/profileMetadata'
import type { CSSProperties } from 'react'
import { sportTeamColors } from '@/lib/sportTeamArtwork'
import { memberTone } from '@/lib/memberIdentity'
import { ResearchSavedActions } from '@/components/research/ResearchSavedActions'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import { MLB_FAVORITE_TEAMS, resolveFavoriteTeam } from '@/lib/sportFavorites'

interface Props { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }

export const dynamic = 'force-dynamic'

// Every page previously inherited the root layout's generic site-wide title
// ("SlipSurge — The Social Hub...") — sharing a profile link (a core loop
// for a social app built around showing off your record) unfurled with zero
// context about who it even was. Real name/record/avatar now included.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getUserProfile(username)
  return profileMetadata(profile)
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'picks', label: 'Picks' },
  { key: 'replies', label: 'Replies' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'media', label: 'Media' },
  { key: 'communities', label: 'Communities' },
] as const

type ProfileViewTab = typeof TABS[number]['key']
type ProfileReply = { id: string; content: string; created_at: string; post_id: string; post: { content?: string | null; author?: { username?: string | null; display_name?: string | null } | null } | null }
type ProfileCommunity = { role: string; group: { id: string; name: string; slug: string; description?: string | null; avatar_url?: string | null; emoji?: string | null; member_count?: number | null; is_public?: boolean | null } | null }

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params
  const { tab: tabParam } = await searchParams
  const tab: ProfileViewTab = TABS.some(t => t.key === tabParam) ? (tabParam as ProfileViewTab) : 'all'
  const postTab: ProfileTab = tab === 'replies' || tab === 'communities' ? 'all' : tab
  const [profile, supabase] = await Promise.all([getUserProfile(username), createClient()])
  if (!profile) notFound()

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) throw new Error('Profile is temporarily unavailable')
  const isOwnProfile = authUser?.id === profile.id
  const { data: viewer } = authUser ? await supabase.from('users').select('account_type').eq('id', authUser.id).maybeSingle() : { data: null }
  const visibleProfile = visibleFavorites(profile, !MLB_HIBERNATING || viewer?.account_type === 'admin')

  // Checked before any of the heavier posts/achievements/social-platform
  // fetches below — a block (either direction) means neither party should
  // see anything of the other's profile at all, not just posts, matching
  // every mainstream app's "account unavailable" treatment rather than the
  // private-account behavior (which still shows avatar/bio/follower counts).
  const isBlocked = !isOwnProfile && !!authUser && await isBlockedEitherWay(supabase, authUser.id, profile.id)
  if (isBlocked) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.035)] text-[var(--text-2)]"><UserRoundX size={24} /></span>
        <p className="text-[var(--text-1)] font-bold">This profile isn't available</p>
        <p className="text-[var(--text-3)] text-sm mt-1">You or @{profile.username} have blocked each other.</p>
      </div>
    )
  }

  const [{ posts: rawPosts, nextCursor, hasMore }, { count: postsCount }, { count: repostsCount }, { data: achievementRows }, { data: socialPlatforms }, { data: creatorApproval }, { data: creatorGroups }, { data: creatorProducts }, { data: profileReplies }, { data: profileCommunities }, favoriteCatalog] = await Promise.all([
    fetchProfilePostsPage(supabase, { userId: profile.id, tab: postTab, pageSize: 20, hideMlb: MLB_HIBERNATING && viewer?.account_type !== 'admin' }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', profile.id),
    supabase.from('reposts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
    supabase.from('user_badges')
      .select('badge:badges(id, name, description, icon_url, card_image_url)')
      .eq('user_id', profile.id),
    supabase.from('social_platforms').select('*'),
    supabase.from('creator_applications').select('id').eq('user_id', profile.id).eq('status', 'approved').maybeSingle(),
    supabase.from('groups').select('id,name,slug,emoji,member_count,access_type').eq('owner_id', profile.id).eq('is_public', true).order('created_at', { ascending: false }).limit(6),
    supabase.from('creator_products').select('id,title,description,price,product_type,status').eq('creator_id', profile.id).eq('status', 'active').order('created_at', { ascending: false }).limit(6),
    supabase.from('comments').select('id,content,created_at,post_id,parent_id,post:posts(id,content,author:users!posts_author_id_fkey(username,display_name,avatar_url))').eq('author_id', profile.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('group_members').select('role,joined_at,group:groups(id,name,slug,description,avatar_url,emoji,member_count,is_public)').eq('user_id', profile.id).order('joined_at', { ascending: false }).limit(24),
    visibleProfile.favorite_teams?.length ? getFavoriteCatalog(true).catch(() => MLB_FAVORITE_TEAMS) : Promise.resolve([]),
  ])
  const isCreatorProfile = hasCreatorAccess(profile.account_type, Boolean(creatorApproval))
  const achievements = (achievementRows ?? []).map((r: any) => r.badge).filter(Boolean)
  const replies = (profileReplies ?? []) as unknown as ProfileReply[]
  const communities = ((profileCommunities ?? []) as unknown as ProfileCommunity[])
    .filter(entry => entry.group && (entry.group.is_public || isOwnProfile))

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
  const mappedPosts = postsWithReactions

  const favoriteBrand = (visibleProfile.favorite_teams ?? []).map((team: string) => {
    const resolved = resolveFavoriteTeam(team, favoriteCatalog, visibleProfile.favorite_sports ?? [])
    if (resolved) return sportTeamColors(resolved.sport, resolved.abbr)
    const [sport, abbreviation] = team.split(':')
    return sportTeamColors(sport, abbreviation)
  }).find(Boolean)

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-28 pt-3 sm:px-5 sm:pt-5">
      <div className="ss-member-profile overflow-hidden rounded-xl border border-[rgba(var(--line-rgb),0.09)] bg-[var(--surface)]">
      {/* Banner */}
      <div className={`ss-member-cover ${profile.banner_url ? 'has-image' : ''}`} style={favoriteBrand ? { '--atmosphere-primary': favoriteBrand[0], '--atmosphere-secondary': favoriteBrand[1] } as CSSProperties : undefined}>
        {profile.banner_url && <SafeImage src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
      </div>

      {/* Profile header */}
      <div className="px-4 pb-5 sm:px-7 sm:pb-7">
        <div className="ss-profile-identity-row relative z-10 flex flex-wrap items-end justify-between gap-3 -mt-12 sm:-mt-16 mb-5">
          <MemberAvatar src={profile.avatar_url} name={profile.display_name || profile.username} size={112}
            tone={memberTone(profile)}
            ringStyle={profile.avatar_ring_style} ringColor={profile.avatar_ring_color} />
          <div className="ss-member-profile-actions ss-profile-identity-actions flex basis-full sm:basis-auto flex-wrap items-center justify-start sm:justify-end gap-2">
            <div className="ss-profile-utility-actions">
            <ResearchSavedActions />
            <ProfileActions username={profile.username}>
              {!isOwnProfile && authUser ? <BlockUserButton currentUserId={authUser.id} targetUserId={profile.id} targetUsername={profile.username} initialBlocked={false} variant="dropdown-item" /> : undefined}
            </ProfileActions>
            </div>
            <div className="ss-profile-relationship-actions">
            {isOwnProfile ? (
            <a href="/settings/profile"
              className="inline-flex items-center h-9 px-4 text-sm rounded-xl border border-[var(--border-2)] text-[var(--text-1)] hover:bg-[var(--surface-2)] font-bold transition-colors">
              Edit Profile
            </a>
          ) : authUser ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/messages/${profile.username}`} aria-label={`Message ${profile.display_name || profile.username}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[rgba(var(--line-rgb),0.1)] bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--text-2)] transition hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:text-[var(--text-1)]"><MessageCircle size={14}/> Message</Link>
              <FollowButton
                currentUserId={authUser.id}
                targetUserId={profile.id}
                initialFollowing={isFollowing}
              />
            </div>
          ) : (
            <a href="/auth/login"
              className="inline-flex items-center h-9 px-4 text-sm rounded-xl bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] text-[var(--accent-fg)] font-semibold transition-colors">
              Follow
            </a>
            )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-1)] sm:text-3xl">{profile.display_name || profile.username}</h1>
            {profile.is_verified && <BadgeCheck size={18} className="text-[var(--accent)]" aria-label="Verified" />}
            <UserBadges userId={profile.id} size={18} maxVisible={6} badges={achievements} interactive />
            {isCreatorProfile && (
              <span className="text-xs font-medium text-[var(--gold)] bg-[var(--gold-dim)] px-2 py-1 rounded-md border border-[var(--border)]">Creator</span>
            )}
          </div>
          <p className="text-sm text-[var(--text-3)]">@{profile.username}</p>

          {profile.bio && <p className="max-w-2xl text-[15px] text-[var(--text-2)] leading-7">{profile.bio}</p>}
          {isOwnProfile && !profile.bio && <Link href="/settings/profile" className="inline-flex max-w-xl items-center gap-2 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:text-[var(--accent)]"><Sparkles size={14} /> Add a bio so people know what you cover</Link>}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-[var(--text-2)]">
            {profile.location && (
              <span className="flex items-center gap-1"><MapPin size={12} />{profile.location}</span>
            )}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[var(--green)] hover:underline">
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
                  <span className="flex items-center gap-1.5 rounded-full border border-[rgba(var(--line-rgb),0.09)] bg-[rgba(var(--contrast-rgb),0.035)] py-1 pl-1.5 pr-2.5 text-xs font-bold text-[var(--text-2)] shadow-[inset_0_1px_rgba(255,255,255,.035)]">
                    <SafeImage src={a.icon_url} alt={a.name} className="h-4 w-4 object-contain" />
                    {a.handle}
                    {a.isVerified && <BadgeCheck size={13} className="text-[var(--green)]" />}
                  </span>
                )
                return a.href ? (
                  <a key={a.id} href={a.href} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">{content}</a>
                ) : (
                  <span key={a.id}>{content}</span>
                )
              })}
              {(profile.sportsbooks ?? []).map((book: string) => (
                <span key={book} className="flex items-center rounded-full border border-[rgba(var(--line-rgb),0.09)] bg-[rgba(var(--contrast-rgb),0.035)] p-1.5 shadow-[inset_0_1px_rgba(255,255,255,.035)]" title={book}>
                  <BookLogo vendor={book} size={14} />
                </span>
              ))}
            </div>
          )}

          {/* Stats */}
          <ProfileStats stats={[
            { value: (postsCount ?? 0).toLocaleString('en-US'), label: 'Posts' },
            { value: (repostsCount ?? 0).toLocaleString('en-US'), label: 'Reposts' },
            { value: (profile.following_count ?? 0).toLocaleString('en-US'), label: 'Following' },
            { value: (profile.follower_count ?? 0).toLocaleString('en-US'), label: 'Followers' },
            ...(total > 0 && canViewWinRate ? [
              { value: `${wins}–${losses}`, label: 'Pick Record', accent: true },
              { value: `${winPct}%`, label: 'Win Rate' },
            ] : []),
          ]} />

          {/* Sport badges */}
          {((profile.favorite_sports?.length ?? 0) > 0 || profile.sport_preferences?.length > 0) && (
            <div className="flex gap-1.5 pt-1 flex-wrap">
              {(profile.favorite_sports?.length ? profile.favorite_sports : profile.sport_preferences).filter((s: string) => !MLB_HIBERNATING || viewer?.account_type === 'admin' || s.toUpperCase() !== 'MLB').map((s: string) => <Badge key={s}>{s}</Badge>)}
            </div>
          )}
        </div>
      </div>

      {isCreatorProfile && (
        <section className="mx-4 mb-5 overflow-hidden rounded-2xl border border-[rgba(var(--line-rgb),0.09)] bg-[var(--surface-2)]">
          <div className="flex flex-col gap-4 border-b border-[rgba(var(--line-rgb),0.07)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-[rgba(var(--line-rgb),0.1)] text-[var(--text-2)]"><Store size={18} /></span><div><p className="text-xs text-[var(--text-2)]">Creator community</p><h2 className="text-base font-semibold text-[var(--text-1)]">Join {profile.display_name || profile.username}</h2></div></div>
            <div className="flex gap-2">{isOwnProfile && <Link href="/creators/studio" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-2)] px-3 py-2 text-xs font-bold text-[var(--text-1)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--text-1)]"><Sparkles size={14} /> Creator Studio</Link>}<Link href={`/creators/${profile.username}`} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-fill)] px-3 py-2 text-xs font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-fill)]">View storefront <ArrowRight size={14} /></Link></div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {(creatorProducts ?? []).map(product => <Link href={`/creators/offers/${product.id}`} key={product.id} className="rounded-xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)] p-3 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--text-1)]">{product.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-2)]">{product.description || 'Premium creator access on SlipSurge.'}</p></div><strong className="whitespace-nowrap text-sm text-[var(--accent)]">${Number(product.price).toFixed(2)}</strong></div></Link>)}
            {(creatorGroups ?? []).map(group => <Link href={`/groups/${group.slug}`} key={group.id} className="flex items-center gap-3 rounded-xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)] p-3 transition hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface)] text-lg">{group.emoji || <Users size={16} />}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text-1)]">{group.name}</p><p className="text-xs text-[var(--text-3)]">{group.member_count ?? 0} members · {group.access_type === 'paid' ? 'Member access' : 'Open community'}</p></div></Link>)}
            {(creatorProducts?.length ?? 0) === 0 && (creatorGroups?.length ?? 0) === 0 && <div className="sm:col-span-2 rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-3)]">This creator is setting up their first community and membership.</div>}
          </div>
        </section>
      )}

      <AchievementsSection achievements={achievements} />
      <FavoritesSection teams={visibleProfile.favorite_teams ?? []} players={visibleProfile.favorite_players ?? []} sports={visibleProfile.favorite_sports ?? []} mlbAccess={!MLB_HIBERNATING || viewer?.account_type === 'admin'} catalog={favoriteCatalog} />

      <div className="border-t border-[rgba(var(--line-rgb),0.07)]" />

      {canViewContent ? (
        <>
          {/* Tabs */}
          <nav aria-label="Profile content" className="ss-member-profile-tabs">
            {TABS.map(t => (
              <Link
                key={t.key}
                href={t.key === 'all' ? `/profile/${username}` : `/profile/${username}?tab=${t.key}`}
                aria-current={tab === t.key ? 'page' : undefined}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {/* Profile activity */}
          <div className="px-3 py-4 sm:px-6 sm:py-6">
            {tab === 'replies' ? (
              <div className="space-y-2">
                {replies.length ? replies.map(reply => (
                  <Link key={reply.id} href={`/posts/${reply.post_id}`} className="group block rounded-2xl border border-[rgba(var(--line-rgb),0.075)] bg-[rgba(var(--contrast-rgb),0.018)] p-4 transition hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[rgba(var(--contrast-rgb),0.035)]">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--text-3)]"><MessageCircleReply size={13} className="text-[var(--accent)]"/><span>Replied to {reply.post?.author?.display_name || `@${reply.post?.author?.username || 'a post'}`}</span><time className="ml-auto">{new Date(reply.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time></div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-1)]"><LinkifiedText text={reply.content} /></p>
                    {reply.post?.content ? <p className="mt-3 line-clamp-2 border-l-2 border-[rgba(var(--line-rgb),0.09)] pl-3 text-xs leading-5 text-[var(--text-3)]"><LinkifiedText text={reply.post.content} /></p> : null}
                  </Link>
                )) : <ProfileEmpty icon={<MessageCircleReply size={24}/>} title="No replies yet" />}
              </div>
            ) : tab === 'communities' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {communities.length ? communities.map(entry => (
                  <Link key={entry.group?.id} href={`/groups/${entry.group?.slug}`} className="flex min-h-24 items-center gap-3 rounded-2xl border border-[rgba(var(--line-rgb),0.075)] bg-[rgba(var(--contrast-rgb),0.018)] p-4 transition hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[rgba(var(--contrast-rgb),0.035)]">
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface-2)] text-xl"><SafeImage src={entry.group?.avatar_url} alt="" className="h-full w-full object-cover" fallback={entry.group?.emoji || '⚡'}/></span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--text-1)]">{entry.group?.name}</strong><small className="mt-1 block line-clamp-1 text-[12px] text-[var(--text-3)]">{entry.group?.description || `${entry.group?.member_count ?? 0} members`}</small><em className="mt-2 block text-[11px] font-semibold uppercase not-italic tracking-wider text-[var(--accent)]">{entry.role}</em></span>
                    <ArrowRight size={14} className="text-[var(--text-3)]"/>
                  </Link>
                )) : <div className="sm:col-span-2"><ProfileEmpty icon={<UsersRound size={24}/>} title="No public communities yet" /></div>}
              </div>
            ) : mappedPosts.length === 0 && !hasMore ? (
              <div className="mx-auto my-5 max-w-lg rounded-[22px] border border-dashed border-[rgba(var(--line-rgb),0.1)] bg-[rgba(var(--contrast-rgb),0.018)] px-5 py-14 text-center">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.035)] text-[var(--text-2)]"><MessageSquareText size={24} /></span>
                <p className="font-bold text-[var(--text-2)]">
                  {tab === 'picks' ? 'No picks posted yet' : tab === 'reposts' ? 'Nothing reposted yet' : tab === 'media' ? 'No media posted yet' : 'No posts yet'}
                </p>
                {isOwnProfile && tab === 'all' && (
                  <p className="text-[var(--text-3)] text-sm mt-1">Share your first pick on the <a href="/feed" className="text-[var(--green)] hover:underline">feed</a></p>
                )}
              </div>
            ) : (
              <ProfilePostList
                userId={profile.id}
                tab={postTab}
                initialPosts={mappedPosts}
                initialCursor={nextCursor}
                initialHasMore={hasMore}
                viewerId={authUser?.id ?? null}
              />
            )}
          </div>
        </>
      ) : (
        <div className="px-4 py-16 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.035)] text-[var(--text-2)]"><LockKeyhole size={24} /></span>
          <p className="text-[var(--text-1)] font-bold">This account is private</p>
          <p className="text-[var(--text-3)] text-sm mt-1">Follow @{profile.username} to see their posts and picks.</p>
        </div>
      )}
      </div>
    </div>
  )
}

function ProfileEmpty({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="mx-auto my-5 max-w-lg rounded-[22px] border border-dashed border-[rgba(var(--line-rgb),0.1)] bg-[rgba(var(--contrast-rgb),0.018)] px-5 py-14 text-center"><span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.035)] text-[var(--text-2)]">{icon}</span><p className="font-bold text-[var(--text-2)]">{title}</p></div>
}
