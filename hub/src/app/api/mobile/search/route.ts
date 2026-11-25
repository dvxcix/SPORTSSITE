import { NextResponse } from 'next/server'
import { getBlockedEitherWayIds, isAccountId } from '@/lib/blocks'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { POST_WITH_AUTHOR } from '@/lib/feedQuery'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { mobilePost } from '@/lib/nativeSocial'
import { attachUserReactions } from '@/lib/queries'
import { requireVerifiedUserTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { fetchVisiblePickRecords, hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const searchTabs = new Set(['all', 'users', 'posts', 'picks', 'community', 'mlb', 'nfl', 'nba'])
const savedFields = 'id,query,result_tab,last_used_at'
const empty = { data: [], error: null }
const bad = () => respond({ error: 'Invalid search' }, 400)
const failed = () => respond({ error: 'Search is temporarily unavailable' }, 503)
const searchText = (value: unknown) => typeof value === 'string' && value.length <= 64 ? value.trim() : null

async function searchAccount(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account
  const tier = await requireVerifiedUserTier(account.userId, 'basic')
  return tier.error ? { error: tier.error } : account
}

type SearchActor = Exclude<Awaited<ReturnType<typeof searchAccount>>, { error: Response }>

async function communityMatches(actor: SearchActor, contains: string, showMlb: boolean) {
  const { supabase, userId } = actor
  const [pages, events] = await Promise.all([
    isFeatureEnabledServer(FEATURE_FLAGS.pages, false, actor),
    isFeatureEnabledServer(FEATURE_FLAGS.events, false, actor),
  ])
  const fields = 'id,slug,name,description,avatar_url,emoji'
  const [groups, publications, channels, meetings] = await Promise.all([
    supabase.from('groups').select(`${fields},sport,member_count`).eq('is_public', true)
      .or(`name.ilike.${contains},description.ilike.${contains}`).order('member_count', { ascending: false }).limit(8),
    pages ? supabase.from('pages').select(`${fields},sport,category,follower_count`).eq('is_published', true)
      .or(`name.ilike.${contains},description.ilike.${contains}`).order('follower_count', { ascending: false }).limit(8) : empty,
    supabase.from('channels').select('id,slug,name,description,icon,member_count,group_id,group:groups(slug,sport)')
      .or(`name.ilike.${contains},description.ilike.${contains}`).order('member_count', { ascending: false }).limit(8),
    events ? supabase.from('events').select('id,title,description,cover_image,start_date,going_count,sport')
      .or(`title.ilike.${contains},description.ilike.${contains}`).order('start_date').limit(8) : empty,
  ])
  if ([groups, publications, channels, meetings].some(result => result.error)) throw Error('Community search unavailable')
  const visible = (sport: string | null | undefined) => showMlb || sport?.trim().toUpperCase() !== 'MLB'
  const rooms = await Promise.all((channels.data ?? []).map(async row => {
    const group = Array.isArray(row.group) ? row.group[0] : row.group
    if (row.group_id && (!group?.slug || !visible(group.sport))) return null
    const permission = await supabase.rpc('get_my_channel_permissions', { p_channel_id: row.id })
    if (permission.error) throw Error('Room visibility unavailable')
    if (row.group_id && permission.data?.view !== true) return null
    const slug = encodeURIComponent(row.slug)
    const path = row.group_id ? `/groups/${encodeURIComponent(group!.slug)}?view=chat&channel=${slug}` : `/channels/${slug}`
    return { id: row.id, path, name: row.name, description: row.description, emoji: row.icon, count: row.member_count }
  }))
  return {
    groups: (groups.data ?? []).filter(row => visible(row.sport)).map(row => ({
      ...row, path: `/groups/${encodeURIComponent(row.slug)}`, count: row.member_count,
    })),
    pages: (publications.data ?? []).filter(row => visible(row.sport) && visible(row.category)).map(row => ({
      ...row, path: `/pages/${encodeURIComponent(row.slug)}`, count: row.follower_count,
    })),
    rooms: rooms.flatMap(row => row ?? []),
    events: (meetings.data ?? []).filter(row => visible(row.sport)).map(row => ({
      id: row.id, path: `/events/${row.id}`, name: row.title, description: row.description,
      avatar_url: row.cover_image, time: row.start_date, count: row.going_count,
    })),
  }
}

export async function GET(request: Request) {
  const actor = await searchAccount(request)
  if (actor.error) return actor.error
  const { supabase, userId } = actor
  const params = new URL(request.url).searchParams
  const views = params.getAll('view')
  if (views.length > 1 || views.length === 1 && views[0] !== 'saved') return bad()
  try {
    if (views[0] === 'saved') {
      const [result, allowMlb] = await Promise.all([
        supabase.from('saved_searches').select(savedFields).eq('user_id', userId)
          .order('last_used_at', { ascending: false }).order('id', { ascending: false }).limit(12),
        canViewMlb(supabase, userId),
      ])
      return result.error ? failed() : respond({ searches: result.data ?? [], allowMlb })
    }
    const query = searchText(params.get('q')), tab = params.get('tab') ?? 'all'
    if (!query || !searchTabs.has(tab) || params.getAll('q').length !== 1 || params.getAll('tab').length > 1) return bad()
    const literal = query.replace(/[%*,()"\\]/g, ' ').trim().replaceAll('_', '\\_')
    if (!literal) return respond({ users: [], posts: [], groups: [], pages: [], rooms: [], events: [] })
    const contains = `%${literal}%`
    const searchUsers = tab === 'all' || tab === 'users'
    const searchPosts = tab === 'all' || tab === 'posts' || tab === 'picks'
    const searchCommunity = tab === 'all' || tab === 'community'
    const [showMlb, blockedIds] = await Promise.all([
      canViewMlb(supabase, userId),
      searchUsers || searchPosts ? getBlockedEitherWayIds(supabase, userId) : [],
    ])
    const userFields = 'id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified,account_type,follower_count'
    let matches = supabase.from('posts').select(POST_WITH_AUTHOR).eq('visibility', 'public').ilike('content', contains)
    if (tab === 'picks') matches = matches.in('post_type', ['pick', 'parlay'])
    const [users, byContent, recentPicks, community] = await Promise.all([
      searchUsers ? supabase.from('users').select(userFields)
        .or(`username.ilike.${contains},display_name.ilike.${contains}`).limit(8) : empty,
      searchPosts ? matches.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(15) : empty,
      searchPosts ? supabase.from('posts').select(POST_WITH_AUTHOR).eq('visibility', 'public').in('post_type', ['pick', 'parlay'])
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(150) : empty,
      searchCommunity ? communityMatches(actor, contains, showMlb) : { groups: [], pages: [], rooms: [], events: [] },
    ])
    if (users.error || byContent.error || recentPicks.error) return failed()
    const blocked = new Set(blockedIds)
    const activeUsers = (users.data ?? []).filter(user => !blocked.has(user.id))
    const lowerQuery = query.toLowerCase()
    const pickMatches = (recentPicks.data ?? []).filter(post => JSON.stringify(post.pick_data ?? {}).toLowerCase().includes(lowerQuery))
    const unique = new Map([...pickMatches, ...(byContent.data ?? [])].map(row => [row.id, row]))
    const ordered = [...unique.values()].filter(row => !blocked.has(row.author_id) && (showMlb || row.sport?.toUpperCase() !== 'MLB'))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, 15)
    const [records, enriched] = await Promise.all([
      fetchVisiblePickRecords(supabase, activeUsers.map(user => user.id)),
      attachUserReactions(ordered, userId, supabase, true),
    ])
    const { posts } = await hydrateVisibleAuthorRecords(supabase, enriched)
    return respond({
      users: activeUsers.map(user => ({ ...user, record: records.records.get(user.id.toLowerCase()) ?? null })),
      posts: posts.map(mobilePost),
      ...community,
    })
  } catch {
    return failed()
  }
}

export async function POST(request: Request) {
  const actor = await searchAccount(request)
  if (actor.error) return actor.error
  if (Number(request.headers.get('content-length')) > 1024) return bad()
  let data: unknown
  try {
    const text = await request.text()
    if (text.length > 1024) return bad()
    data = JSON.parse(text)
  } catch { return bad() }
  if (!data || typeof data !== 'object' || !('query' in data) || !('tab' in data)) return bad()
  const query = searchText(data.query)
  if (!query || typeof data.tab !== 'string' || !searchTabs.has(data.tab)) return bad()
  try {
    const result = await actor.supabase.from('saved_searches').upsert({
      user_id: actor.userId, query, query_key: query.toLocaleLowerCase('en-US'),
      result_tab: data.tab, last_used_at: new Date().toISOString(),
    }, { onConflict: 'user_id,query_key,result_tab' }).select(savedFields).single()
    return result.error ? failed() : respond({ search: result.data })
  } catch {
    return failed()
  }
}

async function changeSaved(request: Request, remove: boolean) {
  const actor = await searchAccount(request)
  if (actor.error) return actor.error
  const ids = new URL(request.url).searchParams.getAll('id')
  if (ids.length !== 1 || !isAccountId(ids[0])) return bad()
  const table = actor.supabase.from('saved_searches')
  const write = remove ? table.delete() : table.update({ last_used_at: new Date().toISOString() })
  try {
    const result = await write.eq('id', ids[0]).eq('user_id', actor.userId)
    return result.error ? failed() : respond({ ok: true })
  } catch {
    return failed()
  }
}

export const PATCH = (request: Request) => changeSaved(request, false)
export const DELETE = (request: Request) => changeSaved(request, true)
