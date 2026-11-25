import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

function resource(value: string | null) {
  switch (value) {
    case 'pages': return { table: 'pages', visible: 'is_published.eq.true', owner: 'owner_id', limit: 50,
      fields: 'id,slug,name,emoji,avatar_url,category,sport,is_published,is_verified,follower_count,created_at,person:users(username,display_name)' } as const
    case 'articles': return { table: 'blogs', visible: 'status.eq.published', owner: 'author_id', limit: 100,
      fields: 'id,slug,title,category,sport,status,view_count,like_count,cover_image,created_at,person:users(username,display_name)' } as const
    default: return null
  }
}

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const target = resource(new URL(request.url).searchParams.get('kind'))
  if (!target) return reply({ error: 'Choose a publication type' }, 400)
  const result = await actor.admin.from(target.table).select(target.fields).or(`${target.visible},${target.owner}.eq.${actor.user.id}`)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(target.limit)
  return result.error ? reply({ error: 'Publications could not be loaded' }, 503) : reply({ entries: result.data ?? [] })
}

export async function POST(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const target = resource(new URL(request.url).searchParams.get('kind'))
  const body: Record<string, unknown> | null = await request.json().catch(() => null)
  if (!target || typeof body?.id !== 'string' || !isAccountId(body.id)) return reply({ error: 'Choose a valid publication' }, 400)
  const permitted = `${target.visible},${target.owner}.eq.${actor.user.id}`
  if (body.action === 'delete') {
    const result = await actor.admin.from(target.table).delete().eq('id', body.id).or(permitted).select('id').maybeSingle()
    if (result.error) return reply({ error: 'Publication could not be deleted' }, 503)
    return result.data ? reply({ id: result.data.id }) : reply({ error: 'Publication not found' }, 404)
  }
  if (target.table !== 'pages' || body.action !== 'verify' || typeof body.verified !== 'boolean'
    || (body.expected !== null && typeof body.expected !== 'boolean')) return reply({ error: 'Choose a valid publication action' }, 400)
  const update = actor.admin.from('pages').update({ is_verified: body.verified }).eq('id', body.id).or(permitted)
  const result = await (body.expected === null ? update.is('is_verified', null) : update.eq('is_verified', body.expected)).select('id').maybeSingle()
  if (result.error) return reply({ error: 'Verification could not be saved' }, 503)
  return result.data ? reply({ id: result.data.id }) : reply({ error: 'This page changed. Reload before verifying.' }, 409)
}
