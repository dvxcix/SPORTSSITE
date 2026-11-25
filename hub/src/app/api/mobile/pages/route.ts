import { NextResponse } from 'next/server'
import { getBlockedEitherWayIds, isAccountId } from '@/lib/blocks'
import { readChannelHistoryCursor } from '@/lib/channelHistory'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { POST_WITH_AUTHOR, type FeedPost } from '@/lib/feedQuery'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { mobilePost } from '@/lib/nativeSocial'
import { attachUserReactions } from '@/lib/queries'
import { hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const fields = 'id,owner_id,name,slug,description,category,sport,emoji,avatar_url,banner_url,is_verified,is_published,follower_count,created_at'
const categories = new Set(['Team', 'Athlete', 'Media', 'Brand', 'Community', 'Podcast', 'Other'])
const sports = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General'])
const icons = new Set(['⭐', '🏈', '⚾', '🏀', '🏒', '⚽', '🎯', '🔥', '💰', '📊'])
const slugPattern = /^[a-z0-9-]{1,80}$/
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value.trim() : null
const unavailable = () => reply({ error: 'Page could not be confirmed' }, 503)
const missing = () => reply({ error: 'Page not found' }, 404)

function image(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

async function accountAccess(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return { error: account.error }
  if (!await isFeatureEnabledServer(FEATURE_FLAGS.pages, false, account)) return { error: reply({ error: 'Pages are currently unavailable' }, 403), hidden: true }
  return account
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const view = params.get('view') ?? 'index'
  const account = await accountAccess(request)
  if (account.error) return view === 'access' && account.hidden ? reply({ enabled: false }) : account.error
  if (view === 'access') return reply({ enabled: true })
  const { supabase, userId } = account
  if (view === 'index' || view === 'mine') {
    const category = params.get('category')
    if (category && !categories.has(category)) return reply({ error: 'Invalid category' }, 400)
    let list = supabase.from('pages').select(fields)
      .order('follower_count', { ascending: false, nullsFirst: false }).order('id').limit(40)
    list = view === 'index' ? list.eq('is_published', true) : list.eq('owner_id', userId)
    if (category) list = list.eq('category', category)
    const { data, error } = await list
    return error ? unavailable() : reply({ pages: data ?? [] })
  }
  if (view !== 'detail') return reply({ error: 'Choose a page view' }, 400)
  const slug = params.get('slug') ?? ''
  const token = params.get('after')
  const after = token ? readChannelHistoryCursor(token) : null
  if (!slugPattern.test(slug) || (token && !after)) return reply({ error: 'Choose a valid page and position' }, 400)
  const current = await supabase.from('pages').select(fields).eq('slug', slug).maybeSingle()
  if (current.error) return unavailable()
  const page = current.data
  if (!page || page.is_published !== true && page.owner_id !== userId) return missing()

  try {
    let listing = supabase.from('posts').select(POST_WITH_AUTHOR).eq('page_id', page.id).is('group_id', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(21)
    if (after) listing = listing.or(`created_at.lt.${after.at},and(created_at.eq.${after.at},id.lt.${after.id})`)
    const [raw, follow, followers, blocked, allowMlb] = await Promise.all([
      listing, supabase.from('page_follows').select('id').eq('page_id', page.id).eq('user_id', userId).maybeSingle(),
      supabase.from('page_follows').select('id', { count: 'exact', head: true }).eq('page_id', page.id),
      getBlockedEitherWayIds(supabase, userId), canViewMlb(supabase, userId),
    ])
    if (raw.error || follow.error || followers.error) return unavailable()
    const slice = (raw.data ?? []).slice(0, 20) as FeedPost[]
    const last = slice.at(-1)
    const excluded = new Set(blocked)
    const visible = slice.filter(row => !excluded.has(row.author_id) && (allowMlb || row.sport?.toUpperCase() !== 'MLB'))
    const posts = await attachUserReactions(visible, userId, supabase, true)
    const enriched = await hydrateVisibleAuthorRecords(supabase, posts)
    const next = last && (raw.data?.length ?? 0) > 20 ? `${last.created_at}|${last.id}` : null
    return reply({ page: { ...page, follower_count: followers.count ?? page.follower_count }, owner: page.owner_id === userId,
      following: !!follow.data, allowMlb, posts: enriched.posts.map(mobilePost), next })
  } catch { return unavailable() }
}

export async function POST(request: Request) {
  const account = await accountAccess(request)
  if (account.error) return account.error
  const body: Record<string, unknown> | null = await request.json().catch(() => null)
  const { supabase, userId } = account
  if (!body || typeof body.id !== 'string' || !isAccountId(body.id)) return reply({ error: 'Choose a valid page' }, 400)
  const { id, action } = body
  if (action === 'follow') {
    if (typeof body.following !== 'boolean') return reply({ error: 'Invalid follow selection' }, 400)
    const current = await supabase.from('pages').select('id,owner_id').eq('id', id).eq('is_published', true).maybeSingle()
    if (current.error) return unavailable()
    if (!current.data) return missing()
    if (current.data.owner_id === userId) return reply({ error: 'You own this page' }, 400)
    const result = body.following
      ? await supabase.from('page_follows').upsert({ user_id: userId, page_id: id }, { onConflict: 'user_id,page_id', ignoreDuplicates: true })
      : await supabase.from('page_follows').delete().eq('user_id', userId).eq('page_id', id)
    if (result.error) return unavailable()
    const followers = await supabase.from('page_follows').select('id', { count: 'exact', head: true }).eq('page_id', id)
    return followers.error ? unavailable() : reply({ following: body.following, follower_count: followers.count ?? 0 })
  }
  if (action === 'delete') {
    const result = await supabase.from('pages').delete().eq('id', id).eq('owner_id', userId).select('id').maybeSingle()
    if (result.error) return unavailable()
    return result.data ? reply({ id: result.data.id }) : missing()
  }
  if (action !== 'create' && action !== 'settings') return reply({ error: 'Choose a page action' }, 400)
  const name = text(body.name, 60)
  const description = text(body.description, 280)
  const category = text(body.category, 20)
  const sport = text(body.sport, 20)
  const emoji = text(body.emoji, 12)
  const avatar = text(body.avatar, 500)
  const banner = text(body.banner, 500)
  if (!name || description === null || category === null || sport === null || !emoji || !icons.has(emoji)
    || avatar === null || banner === null || !image(avatar) || !image(banner) || (category && !categories.has(category))
    || (sport && !sports.has(sport)) || typeof body.published !== 'boolean') return reply({ error: 'Check the page fields' }, 400)
  const values = { name, description: description || null, category: category || null, sport: sport || null, emoji,
    avatar_url: avatar || null, banner_url: banner || null, is_published: body.published }
  if (action === 'settings') {
    const expected = body.expected as typeof values | undefined
    if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      (expected.is_published !== null && typeof expected.is_published !== 'boolean')
      || Object.keys(values).some(key => !(key in expected))
      || Object.values(expected).some(value => !(value === null || typeof value === 'boolean' || typeof value === 'string' && value.length <= 500))) {
      return reply({ error: 'Reload the page before saving' }, 400)
    }
    let change = supabase.from('pages').update(values).eq('id', id).eq('owner_id', userId)
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      change = expected[key] === null ? change.is(key, null) : change.eq(key, expected[key])
    }
    const result = await change.select(fields).maybeSingle()
    return result.error ? unavailable() : result.data ? reply({ page: result.data }) : reply({ error: 'This page changed. Reload before saving.' }, 409)
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!slug) return reply({ error: 'Use a letter or number in the page name' }, 400)
  const created = await supabase.from('pages').insert({ id, owner_id: userId, slug, ...values }).select(fields).single()
  if (!created.error) return reply({ page: created.data }, 201)
  if (created.error.code !== '23505') return unavailable()
  const previous = await supabase.from('pages').select(fields).eq('id', id).eq('owner_id', userId).maybeSingle()
  if (previous.error) return unavailable()
  const existing = previous.data
  return existing && existing.slug === slug && Object.entries(values).every(([key, value]) => existing[key as keyof typeof existing] === value)
    ? reply({ page: existing }) : reply({ error: 'That page name is already in use' }, 409)
}
