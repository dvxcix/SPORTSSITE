import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SPORTS = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'NCAAF', 'NCAAB'])
const VISIBILITY = new Set(['public', 'followers', 'premium'])

async function creator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('account_type').eq('id', user.id).single()
  if (!profile || !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type)) return { error: NextResponse.json({ error: 'Creator access required' }, { status: 403 }) }
  return { user, admin }
}

export async function POST(request: NextRequest) {
  const gate = await creator(); if ('error' in gate) return gate.error
  const body = await request.json().catch(() => null) as { content?: string; postType?: string; sport?: string; visibility?: string; scheduledFor?: string; draft?: boolean } | null
  const payload = body ?? {}
  const content = payload.content?.trim() ?? ''
  const scheduledFor = new Date(payload.scheduledFor ?? '')
  if (!content || content.length > 500) return NextResponse.json({ error: 'Post must be between 1 and 500 characters.' }, { status: 400 })
  if (!payload.draft && (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() + 60_000 || scheduledFor.getTime() > Date.now() + 366 * 86400_000)) return NextResponse.json({ error: 'Choose a time between one minute and one year from now.' }, { status: 400 })
  const rate = await consumeServerRateLimit(gate.user.id, 'creator_schedule_post', 60, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Scheduling is temporarily unavailable.' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Scheduling limit reached. Try again later.' }, { status: 429 })
  const { data, error } = await gate.admin.from('creator_scheduled_posts').insert({
    creator_id: gate.user.id, content, post_type: payload.postType === 'analysis' ? 'analysis' : 'text',
    sport: SPORTS.has(payload.sport ?? '') ? payload.sport : null,
    visibility: VISIBILITY.has(payload.visibility ?? '') ? payload.visibility : 'public',
    scheduled_for: payload.draft ? new Date(Date.now() + 366 * 86400_000).toISOString() : scheduledFor.toISOString(),
    status: payload.draft ? 'draft' : 'scheduled',
  }).select('id,content,post_type,sport,visibility,scheduled_for,status,published_post_id,attempts,created_at,updated_at').single()
  if (error || !data) return safeApiError('creator-scheduled-post-create', error, 'Could not save scheduled post')
  return NextResponse.json({ post: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const gate = await creator(); if ('error' in gate) return gate.error
  const rate = await consumeServerRateLimit(gate.user.id, 'creator_update_scheduled_post', 180, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Scheduling is temporarily unavailable.' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Update limit reached. Try again later.' }, { status: 429 })
  const body = await request.json().catch(() => null) as { id?: string; action?: 'cancel' | 'schedule' | 'edit'; scheduledFor?: string; content?: string; postType?: string; sport?: string; visibility?: string; draft?: boolean } | null
  if (!body?.id || !UUID.test(body.id) || !['cancel', 'schedule', 'edit'].includes(body.action ?? '')) return NextResponse.json({ error: 'Invalid scheduled-post update.' }, { status: 400 })
  const updates: Record<string, string | null> = body.action === 'cancel' ? { status: 'canceled' } : { status: body.draft ? 'draft' : 'scheduled' }
  if (body.action === 'schedule' || (body.action === 'edit' && !body.draft)) {
    const when = new Date(body.scheduledFor ?? '')
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 60_000 || when.getTime() > Date.now() + 366 * 86400_000) return NextResponse.json({ error: 'Choose a time between one minute and one year from now.' }, { status: 400 })
    updates.scheduled_for = when.toISOString(); updates.last_error = null
  }
  if (body.action === 'edit') {
    const content = body.content?.trim() ?? ''
    if (!content || content.length > 500) return NextResponse.json({ error: 'Post must be between 1 and 500 characters.' }, { status: 400 })
    updates.content = content
    updates.post_type = body.postType === 'analysis' ? 'analysis' : 'text'
    updates.sport = SPORTS.has(body.sport ?? '') ? body.sport! : null
    updates.visibility = VISIBILITY.has(body.visibility ?? '') ? body.visibility! : 'public'
  }
  const { data, error } = await gate.admin.from('creator_scheduled_posts').update(updates).eq('id', body.id).eq('creator_id', gate.user.id).in('status', ['draft', 'scheduled', 'failed']).select('id,content,post_type,sport,visibility,scheduled_for,status,published_post_id,attempts,created_at,updated_at').maybeSingle()
  if (error || !data) return safeApiError('creator-scheduled-post-update', error, 'Could not update scheduled post')
  return NextResponse.json({ post: data })
}

export async function DELETE(request: NextRequest) {
  const gate = await creator(); if ('error' in gate) return gate.error
  const rate = await consumeServerRateLimit(gate.user.id, 'creator_delete_scheduled_post', 60, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Scheduling is temporarily unavailable.' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Delete limit reached. Try again later.' }, { status: 429 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'Invalid scheduled post.' }, { status: 400 })
  const { error } = await gate.admin.from('creator_scheduled_posts').delete().eq('id', id).eq('creator_id', gate.user.id).in('status', ['draft', 'scheduled', 'failed', 'canceled'])
  if (error) return safeApiError('creator-scheduled-post-delete', error, 'Could not delete scheduled post')
  return NextResponse.json({ ok: true })
}
