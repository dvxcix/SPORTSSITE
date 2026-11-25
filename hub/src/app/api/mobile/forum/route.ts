import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getBlockedEitherWayIds, isAccountId } from '@/lib/blocks'
import { readChannelHistoryCursor } from '@/lib/channelHistory'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { extractMentionedUsernames, notifyMentions } from '@/lib/mentions'
import { notify } from '@/lib/notify'
import { requireVerifiedUserTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const categories = 'id,slug,name,description,sport,icon,thread_count'
const author = 'author:users(username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified)'
const threadFields = `id,title,content,author_id,category_id,is_pinned,is_locked,created_at,last_reply_at,reply_count,${author},category:forum_categories(name,slug)`
const replyFields = `id,content,author_id,parent_reply_id,is_deleted,edited_at,created_at,${author}`
const emojis = new Set(['⬆️', '⬇️', '🔥', '👍', '💡', '👀'])
const isId = (value: unknown): value is string => typeof value === 'string' && isAccountId(value)
const visibleBody = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value.trim() : null

type ForumReaction = { emoji: string; count: number; mine: boolean }

async function forumReactions(client: SupabaseClient, ids: string[], viewer: string | null) {
  const grouped = new Map<string, Map<string, ForumReaction>>()
  const limit = 1000
  for (let start = 0; ; start += limit) {
    const { data, error } = await client.from('reactions').select('target_id,emoji,user_id')
      .in('target_id', ids).in('target_type', ['forum_thread', 'forum_reply'])
      .order('id').range(start, start + limit - 1)
    if (error) throw new Error('Reaction access unavailable')
    for (const row of data ?? []) {
      if (!emojis.has(row.emoji)) continue
      const byEmoji = grouped.get(row.target_id) ?? new Map<string, ForumReaction>()
      const current = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false }
      current.count += 1
      current.mine ||= viewer != null && viewer === row.user_id
      byEmoji.set(row.emoji, current)
      grouped.set(row.target_id, byEmoji)
    }
    if (!data || data.length < limit) break
  }
  return Object.fromEntries([...grouped].map(([id, values]) => [id, Array.from(values.values())]))
}

async function visibleMentions(client: SupabaseClient, viewer: string, bodies: (string | null)[]) {
  const names = [...new Set(bodies.flatMap(body => body ? extractMentionedUsernames(body) : []))].slice(0, 30)
  if (!names.length) return []
  try {
    const blocked = new Set(await getBlockedEitherWayIds(client, viewer))
    const conditions = names.map(name => `username.ilike.${JSON.stringify(name.replaceAll('_', '\\_'))}`).join(',')
    const { data } = await client.from('users').select('id,username').or(conditions).limit(names.length * 2)
    return (data ?? []).filter(row => typeof row.username === 'string' && !blocked.has(row.id)).map(row => row.username.toLowerCase())
  } catch { return [] }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const view = params.get('view') ?? 'categories'
  if (!['access', 'categories', 'category', 'detail', 'mentions'].includes(view)) return reply({ error: 'Choose a discussion view' }, 400)
  if (!request.headers.has('authorization') && view === 'access') return reply({ enabled: false })
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const client: SupabaseClient = account.supabase
  const viewer = account.userId
  if (!await isFeatureEnabledServer(FEATURE_FLAGS.forum, false, account)) {
    return view === 'access' ? reply({ enabled: false }) : reply({ error: 'Discussions are currently unavailable' }, 403)
  }
  const membership = await requireVerifiedUserTier(viewer, 'basic')
  if (membership.error) {
    if (membership.error.status !== 403) return membership.error
    return view === 'access' ? reply({ enabled: false }) : reply({ code: 'MEMBERSHIP_REQUIRED', error: 'Upgrade required' }, 403)
  }
  if (view === 'access') return reply({ enabled: true })
  if (view === 'mentions') {
    const term = params.get('q') ?? ''
    if (!/^[a-z0-9_.]{0,30}$/i.test(term)) return reply({ error: 'Enter a valid username' }, 400)
    try {
      const blocked = await getBlockedEitherWayIds(client, viewer)
      const literal = term.replaceAll('_', '\\_')
      const prefix = JSON.stringify(`${literal}%`)
      const contains = JSON.stringify(`%${literal}%`)
      const search = client.from('users').select('id,username,display_name,avatar_url,is_verified')
        .neq('id', viewer).or(`username.ilike.${prefix},display_name.ilike.${contains}`)
        .order('follower_count', { ascending: false }).order('id').limit(8)
      const result = await (blocked.length ? search.not('id', 'in', `(${blocked.join(',')})`) : search)
      return result.error ? reply({ error: 'Members could not be loaded' }, 503)
        : reply({ members: (result.data ?? []).filter(member => member.username) })
    } catch { return reply({ error: 'Members could not be loaded' }, 503) }
  }
  if (view === 'categories') {
    const { data, error } = await client.from('forum_categories').select(categories).order('sort_order').order('id')
    return error ? reply({ error: 'Categories could not be loaded' }, 503) : reply({ categories: data ?? [] })
  }
  if (view === 'category') {
    const slug = params.get('slug')
    if (!slug || !/^[a-z0-9][a-z0-9_.-]{0,99}$/i.test(slug)) return reply({ error: 'Choose a valid category' }, 400)
    const category = await client.from('forum_categories').select(categories).eq('slug', slug).maybeSingle()
    if (category.error) return reply({ error: 'Category could not be loaded' }, 503)
    if (!category.data) return reply({ error: 'Category not found' }, 404)
    const { data, error } = await client.from('forum_threads').select(threadFields).eq('category_id', category.data.id)
      .order('is_pinned', { ascending: false }).order('last_reply_at', { ascending: false }).order('id', { ascending: false }).limit(30)
    return error ? reply({ error: 'Threads could not be loaded' }, 503) : reply({ category: category.data, threads: data ?? [] })
  }
  const id = params.get('id')
  const cursorValue = params.get('after')
  const cursor = cursorValue ? readChannelHistoryCursor(cursorValue) : null
  if (!isId(id) || (cursorValue && !cursor)) return reply({ error: 'Choose a valid thread and position' }, 400)
  try {
    const size = 50
    let rows = client.from('forum_replies').select(replyFields).eq('thread_id', id)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(size + 1)
    if (cursor) rows = rows.or(`created_at.gt.${cursor.at},and(created_at.eq.${cursor.at},id.gt.${cursor.id})`)
    const [thread, replies] = await Promise.all([
      client.from('forum_threads').select(threadFields).eq('id', id).maybeSingle(),
      rows,
    ])
    if (thread.error || replies.error) return reply({ error: 'Thread could not be loaded' }, 503)
    if (!thread.data) return reply({ error: 'Thread not found' }, 404)
    const page = (replies.data ?? []).slice(0, size)
    const last = page.at(-1)
    const next = last && (replies.data?.length ?? 0) > size ? `${last.created_at}|${last.id}` : null
    const visibleReplies = page.map(row => row.is_deleted ? { ...row, content: null } : row)
    const [reactions, mentions] = await Promise.all([
      forumReactions(client, [id, ...page.map(row => row.id)], viewer),
      visibleMentions(client, viewer, [thread.data.content, ...visibleReplies.map(row => row.content)]),
    ])
    return reply({ thread: thread.data, replies: visibleReplies, reactions, mentions, next })
  } catch { return reply({ error: 'Thread could not be loaded' }, 503) }
}

const responseForCode: Record<string, [string, number]> = {
  invalid: ['The discussion action is invalid', 400],
  missing: ['The discussion is unavailable', 404],
  locked: ['This thread is locked', 409],
  conflict: ['This discussion changed. Reload before trying again.', 409],
  limited: ['You’re reacting too quickly. Try again shortly.', 429],
}
function forumFailure(status: string | undefined) {
  const [error, code] = responseForCode[status ?? ''] ?? ['The discussion action could not be confirmed', 503]
  return reply({ error }, code)
}

async function replyReceipt(client: SupabaseClient, id: string, thread: string, status = 200) {
  const result = await client.from('forum_replies').select(replyFields).eq('id', id).eq('thread_id', thread).maybeSingle()
  if (result.error || !result.data) return forumFailure(undefined)
  return reply({ id, reply: result.data.is_deleted ? { ...result.data, content: null } : result.data }, status)
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (!await isFeatureEnabledServer(FEATURE_FLAGS.forum, false, account)) return reply({ error: 'Discussions are currently unavailable' }, 403)
  const membership = await requireVerifiedUserTier(account.userId, 'basic')
  if (membership.error) return membership.error
  const input: Record<string, unknown> | null = await request.json().catch(() => null)
  if (!input || !isId(input.id)) return forumFailure('invalid')
  const { supabase, userId } = account
  const content = visibleBody(input.content, 5000)
  if (input.kind === 'thread') {
    const title = visibleBody(input.title, 120)
    if (!title || content === null || !isId(input.category)) return forumFailure('invalid')
    const category = await supabase.from('forum_categories').select('id').eq('id', input.category).maybeSingle()
    if (category.error) return forumFailure(undefined)
    if (!category.data) return forumFailure('missing')
    const values = { id: input.id, category_id: input.category, author_id: userId, title, content: content || null,
      reply_count: 0, view_count: 0, last_reply_at: new Date().toISOString() }
    const created = await supabase.from('forum_threads').insert(values).select('id').single()
    if (created.error) {
      if (created.error.code !== '23505') return forumFailure(undefined)
      const prior = await supabase.from('forum_threads').select('id,category_id,title,content')
        .eq('id', input.id).eq('author_id', userId).maybeSingle()
      if (prior.error) return forumFailure(undefined)
      return prior.data?.category_id === input.category && prior.data.title === title && prior.data.content === values.content
        ? reply({ id: input.id }) : forumFailure('conflict')
    }
    if (content) await notifyMentions(supabase, userId, content, `/forum/thread/${input.id}`, input.id, 'a discussion').catch(() => undefined)
    return reply({ id: created.data.id }, 201)
  }

  if (!isId(input.thread)) return forumFailure('invalid')
  const thread = input.thread
  const link = `/forum/thread/${thread}`
  if (input.kind === 'reply') {
    const parent = input.parent ?? null
    if (!content || (parent !== null && !isId(parent))) return forumFailure('invalid')
    const { data, error } = await createAdminClient().rpc('create_native_forum_reply', {
      p_actor: userId, p_thread: thread, p_id: input.id, p_parent: parent ?? null, p_content: content,
    })
    if (error || !data) return forumFailure(undefined)
    if (data.status === 'replay') return replyReceipt(supabase, input.id, thread)
    if (data.status !== 'created') return forumFailure(data.status)
    const recipient: unknown = data.recipient
    if (isId(recipient)) {
      await Promise.allSettled([
        notify(supabase, { userId: recipient, actorId: userId, type: 'comment',
          message: parent ? 'replied to your comment' : 'replied to your discussion', link,
          targetId: parent ?? thread, targetType: parent ? 'forum_reply' : 'forum_thread' }),
        notifyMentions(supabase, userId, content, link, thread, 'a discussion reply', [recipient]),
      ])
    }
    return replyReceipt(supabase, input.id, thread, 201)
  }

  if (input.kind === 'reaction') {
    const emoji = input.emoji
    const target = input.target
    if (typeof emoji !== 'string' || !emojis.has(emoji) || typeof input.enabled !== 'boolean'
      || (target !== 'forum_thread' && target !== 'forum_reply')) return forumFailure('invalid')
    const { data, error } = await createAdminClient().rpc('set_native_forum_reaction', {
      p_actor: userId, p_thread: thread, p_target: input.id, p_kind: target, p_emoji: emoji, p_enabled: input.enabled,
    })
    if (error || !data) return forumFailure(undefined)
    if (data.status !== 'confirmed') return forumFailure(data.status)
    if (data.added && emoji !== '⬇️' && isId(data.recipient)) {
      await notify(supabase, { userId: data.recipient, actorId: userId, type: 'reaction',
        message: `reacted ${emoji} to your discussion`, link, targetId: input.id, targetType: target, data: { emoji } }).catch(() => undefined)
    }
    try {
      return reply({ id: input.id, reactions: (await forumReactions(supabase, [input.id], userId))[input.id] ?? [] })
    } catch { return forumFailure(undefined) }
  }

  const expected = input.expectedEditedAt
  if ((input.kind !== 'edit' && input.kind !== 'remove') || (input.kind === 'edit' && !content) ||
    (expected !== null && (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected))))) return forumFailure('invalid')
  let update = supabase.from('forum_replies').update({ content: input.kind === 'edit' ? content : '',
    is_deleted: input.kind === 'remove', edited_at: new Date().toISOString() })
    .eq('id', input.id).eq('thread_id', thread).eq('author_id', userId).eq('is_deleted', false)
  update = expected === null ? update.is('edited_at', null) : update.eq('edited_at', expected)
  const { data, error } = await update.select(replyFields).maybeSingle()
  if (error) return forumFailure(undefined)
  return data ? reply({ id: data.id, reply: data.is_deleted ? { ...data, content: null } : data }) : forumFailure('conflict')
}
