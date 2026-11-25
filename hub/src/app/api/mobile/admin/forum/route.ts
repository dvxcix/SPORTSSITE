import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const [categories, threads] = await Promise.all([
    actor.admin.from('forum_categories').select('id,slug,name,description,sport,icon,thread_count').order('sort_order').order('id'),
    actor.admin.from('forum_threads').select('id,title,is_locked,is_pinned,created_at,reply_count,author:users(username),category:forum_categories(name,slug)')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30),
  ])
  if (categories.error || threads.error) return reply({ error: 'Discussions could not be loaded' }, 503)
  return reply({ categories: categories.data ?? [], threads: threads.data ?? [] })
}

export async function PATCH(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const change: Record<string, unknown> | null = await request.json().catch(() => null)
  const id = change?.id
  if (typeof id !== 'string' || !isAccountId(id) || !change) return reply({ error: 'Choose a valid thread' }, 400)
  const field = change.action === 'pin' ? 'is_pinned' : change.action === 'lock' ? 'is_locked' : null
  if (field === null || typeof change.enabled !== 'boolean' || typeof change.expected !== 'boolean') {
    return reply({ error: 'Invalid discussion update' }, 400)
  }
  const result = await actor.admin.from('forum_threads').update({ [field]: change.enabled }).eq('id', id)
    .eq(field, change.expected).select('id').maybeSingle()
  if (result.error) return reply({ error: 'The discussion could not be updated' }, 503)
  return result.data ? reply({ id: result.data.id }) : reply({ error: 'The discussion changed. Reload before trying again.' }, 409)
}

export async function DELETE(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !isAccountId(id)) return reply({ error: 'Choose a valid thread' }, 400)
  const { data, error } = await actor.admin.from('forum_threads').delete().eq('id', id).select('id').maybeSingle()
  if (error) return reply({ error: 'The discussion could not be deleted' }, 503)
  return data ? reply({ removed: data.id }) : reply({ error: 'Thread not found' }, 404)
}
