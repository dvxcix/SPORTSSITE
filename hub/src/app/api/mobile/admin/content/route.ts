import { NextResponse } from 'next/server'
import { writeAdminAudit } from '@/lib/adminAudit'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const types = new Set(['text', 'pick', 'parlay', 'poll', 'analysis', 'reel'])
const orders = {
  newest: { column: 'created_at', ascending: false }, oldest: { column: 'created_at', ascending: true },
  most_liked: { column: 'reaction_count', ascending: false }, most_commented: { column: 'comment_count', ascending: false },
} as const

function dateParameter(value: string | null) {
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? date : undefined
}

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const params = new URL(request.url).searchParams
  const resource = params.get('kind')
  if (resource === 'stories') {
    const stories = await actor.supabase.from('stories')
      .select('id,media_url,media_type,caption,content,sport,story_type,view_count,expires_at,created_at,author:users(username,display_name,avatar_url)')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
    return stories.error ? reply({ error: 'Stories could not be loaded' }, 503) : reply({ stories: stories.data ?? [] })
  }
  if (resource !== 'posts') return reply({ error: 'Choose posts or stories' }, 400)
  const search = (params.get('q') ?? '').trim()
  const type = params.get('type')
  const sort = params.get('sort') ?? 'newest'
  const start = dateParameter(params.get('from'))
  const end = dateParameter(params.get('to'))
  if (search.length > 100 || /[\x00-\x1f]/.test(search) || type && !types.has(type) || !Object.hasOwn(orders, sort) ||
    start === undefined || end === undefined || start && end && start > end) return reply({ error: 'Check the post filters' }, 400)
  const order = orders[sort as keyof typeof orders]
  let posts = actor.supabase.from('posts')
    .select('id,content,media_urls,post_type,sport,visibility,reaction_count,comment_count,repost_count,created_at,author:users!posts_author_id_fkey(username,display_name,avatar_url)')
    .order(order.column, { ascending: order.ascending, nullsFirst: false }).order('id', { ascending: order.ascending }).limit(100)
  if (search) {
    const pattern = JSON.stringify(`%${search.replace(/[\\%_]/g, '\\$&')}%`)
    const people = await actor.supabase.from('users').select('id').or(`username.ilike.${pattern},display_name.ilike.${pattern}`).order('id').limit(200)
    if (people.error) return reply({ error: 'Author search could not be loaded' }, 503)
    const ids = (people.data ?? []).map(value => value.id)
    posts = ids.length ? posts.or(`content.ilike.${pattern},author_id.in.(${ids.join(',')})`) : posts.or(`content.ilike.${pattern}`)
  }
  if (type) posts = posts.eq('post_type', type)
  if (start) posts = posts.gte('created_at', start.toISOString())
  if (end) posts = posts.lt('created_at', new Date(end.getTime() + 86_400_000).toISOString())
  const result = await posts
  return result.error ? reply({ error: 'Posts could not be loaded' }, 503) : reply({ posts: result.data ?? [] })
}

export async function DELETE(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const params = new URL(request.url).searchParams
  const table = params.get('kind')
  const id = params.get('id')
  if ((table !== 'posts' && table !== 'stories') || !id || !isAccountId(id)) return reply({ error: 'Choose a valid post or story' }, 400)
  const visible = await actor.supabase.from(table).select('id').eq('id', id).maybeSingle()
  if (visible.error) return reply({ error: 'Content visibility could not be confirmed' }, 503)
  if (!visible.data) return reply({ error: 'Content not found' }, 404)
  const removed = await actor.admin.from(table).delete().eq('id', id).select('id').maybeSingle()
  if (removed.error) return reply({ error: 'Content could not be deleted' }, 503)
  if (!removed.data) return reply({ error: 'Content not found' }, 404)
  await writeAdminAudit(actor.admin, { actorUserId: actor.user.id, action: 'content.delete', targetType: table, targetId: id, request }).catch(() => undefined)
  return reply({ id: removed.data.id })
}
