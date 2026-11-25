import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { readChannelHistoryCursor } from '@/lib/channelHistory'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { requireVerifiedUserTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const summaries = 'id,slug,title,excerpt,category,sport,cover_image,status,view_count,like_count,created_at,author_id'
const authors = 'author:users(username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified,bio)'
const categories = new Set(['Analysis', 'Picks', 'News', 'Opinion', 'Preview', 'Recap', 'Fantasy', 'Betting Strategy', 'AI Generated'])
const sports = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA'])
const text = (value: unknown, limit: number) => typeof value === 'string' && value.length <= limit ? value.trim() : null
const validSlug = /^[a-z0-9-]{1,180}$/
const failed = (name = 'Article') => reply({ error: `${name} could not be confirmed` }, 503)

async function authorized(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return { error: account.error }
  if (!await isFeatureEnabledServer(FEATURE_FLAGS.blog, false, account)) return { error: reply({ error: 'Articles are currently unavailable' }, 403), hidden: true }
  const tier = await requireVerifiedUserTier(account.userId, 'basic')
  if (tier.error?.status === 403) return { error: reply({ error: 'Upgrade required', code: 'MEMBERSHIP_REQUIRED' }, 403), hidden: true }
  if (tier.error) return { error: tier.error }
  return account
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const mode = params.get('view') ?? 'index'
  if (mode === 'access' && !request.headers.has('authorization')) return reply({ enabled: false })
  const account = await authorized(request)
  if (account.error) return mode === 'access' && 'hidden' in account ? reply({ enabled: false }) : account.error
  if (mode === 'access') return reply({ enabled: true })
  const { supabase, userId } = account
  if (mode === 'editor') {
    const id = params.get('id') ?? ''
    if (!isAccountId(id)) return reply({ error: 'Choose a valid article' }, 400)
    const { data, error } = await supabase.from('blogs').select(`${summaries},content,updated_at`).eq('id', id).eq('author_id', userId).maybeSingle()
    if (error) return failed()
    return data ? reply({ article: data }) : reply({ error: 'Article not found' }, 404)
  }
  if (mode === 'detail') {
    const slug = params.get('slug') ?? ''
    if (!validSlug.test(slug)) return reply({ error: 'Choose a valid article' }, 400)
    const { data, error } = await supabase.from('blogs').select(`${summaries},content,updated_at,${authors}`).eq('slug', slug).eq('status', 'published').maybeSingle()
    if (error) return failed()
    if (!data) return reply({ error: 'Article not found' }, 404)
    const [related, liked] = await Promise.all([
      supabase.from('blogs').select(`${summaries},${authors}`).eq('status', 'published').neq('id', data.id)
        .eq('category', data.category ?? '').order('created_at', { ascending: false }).limit(3),
      supabase.from('blog_likes').select('blog_id').eq('blog_id', data.id).eq('user_id', userId).maybeSingle(),
    ])
    if (related.error || liked.error) return failed()
    return reply({ article: data, related: related.data ?? [], liked: !!liked.data })
  }
  if (mode !== 'mine' && mode !== 'index') return reply({ error: 'Choose an article view' }, 400)
  const pos = params.get('after')
  const cursor = pos ? readChannelHistoryCursor(pos) : null
  if (pos && !cursor) return reply({ error: 'Invalid article position' }, 400)
  let list = supabase.from('blogs').select(`${summaries},${authors}`)
    .order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(21)
  list = mode === 'mine' ? list.eq('author_id', userId) : list.eq('status', 'published')
  if (cursor) list = list.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`)
  const { data, error } = await list
  if (error) return failed('Articles')
  const articles = (data ?? []).slice(0, 20)
  const last = articles.at(-1)
  return reply({ articles, next: last?.created_at && (data?.length ?? 0) > 20 ? `${last.created_at}|${last.id}` : null })
}

export async function POST(request: Request) {
  const account = await authorized(request)
  if (account.error) return account.error
  const input: Record<string, unknown> | null = await request.json().catch(() => null)
  if (!input || typeof input.id !== 'string' || !isAccountId(input.id)) return reply({ error: 'Choose a valid article' }, 400)
  const { supabase, userId } = account
  const id = input.id
  if (input.action === 'view' || input.action === 'like') {
    const article = await supabase.from('blogs').select('id').eq('id', id).eq('status', 'published').maybeSingle()
    if (article.error) return failed()
    if (!article.data) return reply({ error: 'Article not found' }, 404)
    if (input.action === 'view') {
      const result = await createAdminClient().rpc('record_blog_view', { p_blog_id: id })
      return result.error || typeof result.data !== 'number' ? failed() : reply({ views: result.data })
    }
    if (typeof input.liked !== 'boolean') return reply({ error: 'Choose the article reaction' }, 400)
    const result = await createAdminClient().rpc('set_native_blog_like', { p_blog_id: id, p_user_id: userId, p_liked: input.liked })
    if (result.error) return failed('Like')
    return result.data ? reply(result.data) : reply({ error: 'Article not found' }, 404)
  }
  if (input.action !== 'create' && input.action !== 'edit') return reply({ error: 'Choose an article action' }, 400)
  const title = text(input.title, 140)
  const excerpt = text(input.excerpt, 280)
  const content = text(input.content, 50_000)
  const cover = text(input.cover, 500)
  const category = text(input.category, 50)
  const sport = text(input.sport, 20)
  const status = input.status
  if (!title || excerpt === null || content === null || cover === null || category === null || sport === null ||
    (category && !categories.has(category)) || (sport && !sports.has(sport)) || (status !== 'draft' && status !== 'published')) {
    return reply({ error: 'Check the article fields' }, 400)
  }
  if (cover) {
    try {
      const url = new URL(cover)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return reply({ error: 'Enter a valid image link' }, 400)
    } catch { return reply({ error: 'Enter a valid image link' }, 400) }
  }
  const fields = { title, excerpt: excerpt || content.slice(0, 200) || null, content,
    cover_image: cover || null, category: category || null, sport: sport || null, status }
  const receipt = 'id,slug,status,updated_at'
  if (input.action === 'edit') {
    const expected = input.updatedAt
    if (expected !== null && (typeof expected !== 'string' || expected.length > 40 || !Number.isFinite(Date.parse(expected)))) {
      return reply({ error: 'Reload this article before saving' }, 400)
    }
    const update = supabase.from('blogs').update(fields).eq('id', id).eq('author_id', userId)
    const result = await (expected === null ? update.is('updated_at', null) : update.eq('updated_at', expected)).select(receipt).maybeSingle()
    if (result.error) return failed()
    return result.data ? reply(result.data) : reply({ error: 'This article changed. Reload before saving.' }, 409)
  }
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 140) || 'article'}-${id.toLowerCase()}`
  const result = await supabase.from('blogs').insert({ id, author_id: userId, slug, ...fields }).select(receipt).single()
  if (!result.error) return reply(result.data, 201)
  if (result.error.code !== '23505') return failed()
  const existing = await supabase.from('blogs').select(`${receipt},title,excerpt,content,cover_image,category,sport`)
    .eq('id', id).eq('author_id', userId).maybeSingle()
  const row = existing.data
  if (!row || !Object.entries(fields).every(([key, value]) => row[key as keyof typeof row] === value)) {
    return reply({ error: 'An article already uses this draft identifier' }, 409)
  }
  return reply({ id: row.id, slug: row.slug, status: row.status, updated_at: row.updated_at })
}
