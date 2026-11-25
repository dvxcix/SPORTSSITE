import { NextResponse } from 'next/server'
import { blockUser, getBlockedEitherWayIds, isAccountId, isBlockedEitherWay } from '@/lib/blocks'
import { fetchProfilePostsPage, type ProfileTab } from '@/lib/feedQuery'
import { InvalidFeedCursorError } from '@/lib/feedPagination'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { isGuestVisible, mobilePost, nativeAnonymousClient } from '@/lib/nativeSocial'
import { nativePublicSocialLinks, socialPlatformColumns } from '@/lib/nativeSocialPlatforms'
import { notify } from '@/lib/notify'
import { publicVerifiedIdentities } from '@/lib/publicVerifiedIdentities'
import { isReportReason } from '@/lib/reportReasons'
import { attachUserReactions } from '@/lib/queries'
import { resolveFavoriteTeam } from '@/lib/sportFavorites'
import { sportTeamColors } from '@/lib/sportTeamArtwork'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { PROFILE_PROJECTION_COLUMNS } from '@/lib/supabase/userColumns'
import { visibleFavorites } from '@/lib/visibleFavorites'
import { fetchVisiblePickRecords } from '@/lib/visiblePickRecords'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
const username = /^[A-Za-z0-9._-]{1,80}$/
const postTabs: ProfileTab[] = ['all', 'picks', 'reposts', 'media']

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams
  const target = search.get('user') ?? '', tab = search.get('tab') ?? 'all', cursor = search.get('cursor')
  if (!username.test(target) || (cursor?.length ?? 0) > 2048 || (!postTabs.includes(tab as ProfileTab) && tab !== 'replies' && tab !== 'communities')) {
    return respond({ error: 'Invalid profile selection' }, 400)
  }
  try {
    const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (account?.error) return account.error
    const client = account?.supabase ?? nativeAnonymousClient(), viewer = account?.userId
    const { data: person, error: personError } = await client.from('users')
      .select('id,username,display_name,bio,avatar_url,banner_url,avatar_ring_style,avatar_ring_color,sportsbooks,is_verified,is_private,allow_dms,follower_count,following_count,location,website,created_at,hide_win_rate,social_links')
      .eq(isAccountId(target) ? 'id' : 'username', target).maybeSingle()
    if (personError) throw Error('Profile unavailable')
    if (!person || viewer && viewer !== person.id && await isBlockedEitherWay(client, viewer, person.id)) return respond({ error: 'Profile unavailable' }, 404)
    const own = person.id === viewer
    const [relationship, favorites, allowMlb, badges, platforms] = await Promise.all([
      viewer && !own ? client.from('follows').select('follower_id').eq('follower_id', viewer).eq('following_id', person.id).maybeSingle() : { data: null, error: null },
      createAdminClient().from('users').select(PROFILE_PROJECTION_COLUMNS).eq('id', person.id).maybeSingle(),
      canViewMlb(client, viewer),
      client.from('user_badges').select('badge:badges(id,name,description,icon_url,card_image_url)').eq('user_id', person.id).limit(24),
      client.from('social_platforms').select(socialPlatformColumns).order('sort_order').order('name').order('id'),
    ])
    if (relationship.error || favorites.error || badges.error) throw Error('Profile unavailable')
    const following = Boolean(relationship.data), canView = own || !person.is_private || following
    const settings = favorites.data ? visibleFavorites(favorites.data, allowMlb) : null
    const sports: string[] = settings?.favorite_sports ?? []
    const catalog = settings?.favorite_teams?.length ? await getFavoriteCatalog(true).catch(() => []) : []
    const teams = (settings?.favorite_teams ?? []).flatMap((key: string) => {
      const team = resolveFavoriteTeam(key, catalog, sports)
      return team ? [{ id: team.key, title: team.name, logo: team.logo, sport: team.sport, colors: sportTeamColors(team.sport, team.abbr) }] : []
    })
    const records = canView && (own || !person.hide_win_rate) ? await fetchVisiblePickRecords(client, [person.id]) : null
    const profile = { id: person.id, username: person.username, displayName: person.display_name, bio: person.bio,
      avatarUrl: person.avatar_url, bannerUrl: person.banner_url, avatarRingStyle: person.avatar_ring_style, avatarRingColor: person.avatar_ring_color,
      sportsbooks: person.sportsbooks, verified: person.is_verified, isPrivate: person.is_private,
      allowMessages: person.allow_dms, followerCount: person.follower_count, followingCount: person.following_count,
      location: person.location, website: person.website, createdAt: person.created_at, following, own, canView,
      teams, sports, players: settings?.favorite_players ?? [], verifiedSocials: publicVerifiedIdentities(settings?.verified_identities),
      socialLinks: platforms.error ? null : nativePublicSocialLinks(platforms.data ?? [], person.social_links, settings?.verified_identities),
      badges: (badges.data ?? []).flatMap(item => item.badge ?? []), record: records?.records.get(person.id.toLowerCase()) ?? null,
    }
    if (!canView) return respond({ profile, posts: [], replies: [], communities: [], hasMore: false, nextCursor: null })
    if (tab === 'replies') {
      const result = await client.from('comments').select('id,content,created_at,post_id,post:posts!inner(id,author_id,sport,visibility,is_premium,group_id)')
        .eq('author_id', person.id).order('created_at', { ascending: false }).limit(20)
      if (result.error) throw Error('Replies unavailable')
      const blocked = new Set(viewer ? await getBlockedEitherWayIds(client, viewer) : [])
      const replies = (result.data ?? []).flatMap(row => {
        const post = Array.isArray(row.post) ? row.post[0] : row.post
        return post && !blocked.has(post.author_id) && (allowMlb || post.sport?.toUpperCase() !== 'MLB')
          && (viewer || post.visibility === 'public' && !post.is_premium && post.group_id === null)
          ? [{ id: row.id, text: row.content, createdAt: row.created_at, postId: row.post_id }] : []
      })
      return respond({ profile, posts: [], replies, communities: [], hasMore: false, nextCursor: null })
    }
    if (tab === 'communities') {
      const result = await client.from('group_members').select('role, group:groups(id,name,slug,description,avatar_url,banner_url,emoji,member_count,is_public,access_type,sport)')
        .eq('user_id', person.id).order('joined_at', { ascending: false }).limit(24)
      if (result.error) throw Error('Communities unavailable')
      const communities = (result.data ?? []).flatMap(row => {
        const group = Array.isArray(row.group) ? row.group[0] : row.group
        return group && (group.is_public || own) && (allowMlb || group.sport?.toUpperCase() !== 'MLB') ? [group] : []
      })
      return respond({ profile, posts: [], replies: [], communities, hasMore: false, nextCursor: null })
    }
    const result = await fetchProfilePostsPage(client, { userId: person.id, tab: tab as ProfileTab, cursor, hideMlb: !allowMlb })
    const blocked = new Set(viewer ? await getBlockedEitherWayIds(client, viewer) : [])
    const visible = result.posts.filter(post => !blocked.has(post.author_id) && (viewer || isGuestVisible(post)))
    const posts = await attachUserReactions(visible, viewer, client, true)
    return respond({ profile, posts: posts.map(mobilePost), replies: [], communities: [], hasMore: result.hasMore, nextCursor: result.nextCursor })
  } catch (error) {
    return error instanceof InvalidFeedCursorError ? respond({ error: 'Invalid profile cursor' }, 400)
      : respond({ error: 'Profile is temporarily unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  try {
    const raw = await request.text()
    if (raw.length > 4096) return respond({ error: 'Invalid account action' }, 400)
    const body = JSON.parse(raw)
    const target = typeof body?.id === 'string' && isAccountId(body.id) ? body.id.toLowerCase() : null
    if (!target || target === userId) return respond({ error: 'Invalid account action' }, 400)
    if (await isBlockedEitherWay(supabase, userId, target)) return respond({ error: 'Account unavailable' }, 404)
    const person = await supabase.from('users').select('id').eq('id', target).maybeSingle()
    if (person.error) throw Error('Account unavailable')
    if (!person.data) return respond({ error: 'Account unavailable' }, 404)
    if (body.action === 'report') {
      const details = typeof body.text === 'string' ? body.text.trim() : ''
      if (!isReportReason(body.reason) || details.length > 2000) return respond({ error: 'Check your report' }, 400)
      const result = await supabase.from('reports').insert({ reporter_id: userId, target_type: 'user', target_id: target,
        reason: body.reason, details: details || null, status: 'pending' })
      return result.error ? respond({ error: 'Report could not be submitted' }, 503) : respond({ ok: true })
    }
    if (typeof body.enabled !== 'boolean') return respond({ error: 'Invalid account action' }, 400)
    if (body.action === 'block' && body.enabled) {
      const result = await blockUser(supabase, userId, target)
      return result.ok ? respond({ ok: true }) : respond({ error: 'Block could not be saved' }, 503)
    }
    if (body.action !== 'follow') return respond({ error: 'Unknown account action' }, 400)
    const identity = { follower_id: userId, following_id: target }
    const following = body.enabled ? await supabase.from('follows').insert(identity) : await supabase.from('follows').delete().match(identity)
    if (following.error && following.error.code !== '23505') throw Error('Follow unavailable')
    if (body.enabled && !following.error) {
      const { data: actor } = await supabase.from('users').select('username').eq('id', userId).maybeSingle()
      await notify(supabase, { userId: target, actorId: userId, type: 'follow', message: 'started following you',
        link: actor?.username ? `/profile/${encodeURIComponent(actor.username)}` : null, targetId: userId, targetType: 'user' }).catch(() => {})
    }
    return respond({ ok: true })
  } catch (error) {
    return error instanceof SyntaxError ? respond({ error: 'Invalid account action' }, 400)
      : respond({ error: 'Account action couldn’t be confirmed' }, 503)
  }
}
