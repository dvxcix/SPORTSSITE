import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { accountSettingsActor } from '@/lib/supabase/accountSettingsActor'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SPORTS = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'NCAAF', 'NCAAB'])
const VISIBILITY = new Set(['public', 'followers'])
const COLUMNS = 'id,group_id,content,post_type,sport,visibility,scheduled_for,status,published_post_id,attempts,created_at,updated_at'

async function creator(request: Request) {
  const account = await accountSettingsActor(request)
  if (account.error) return { error: account.error }
  const { user, supabase, native } = account
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('account_type').eq('id', user.id).single()
  const { data: ownedGroup } = await supabase.from('groups').select('id').eq('owner_id', user.id).limit(1).maybeSingle()
  if (!profile || (!ownedGroup && !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type))) return { error: NextResponse.json({ error: 'Creator access required' }, { status: 403 }) }
  return { user, admin, native, mlbAccess: !MLB_HIBERNATING || profile.account_type === 'admin' }
}

export async function POST(request: NextRequest) {
  const gate = await creator(request); if ('error' in gate) return gate.error
  const body = await request.json().catch(() => null) as { id?: string; content?: string; postType?: string; sport?: string; visibility?: string; scheduledFor?: string; draft?: boolean; groupId?: string | null } | null
  const payload = body ?? {}
  const requestId = gate.native && typeof payload.id === 'string' && UUID.test(payload.id) ? payload.id : null
  if (gate.native && !requestId) return NextResponse.json({ error: 'Invalid draft identifier.' }, { status: 400 })
  if (requestId) {
    const { data: previous, error } = await gate.admin.from('creator_scheduled_posts').select(COLUMNS).eq('id', requestId).eq('creator_id', gate.user.id).maybeSingle()
    if (error) return safeApiError('creator-scheduled-post-check', error)
    if (previous && (gate.mlbAccess || previous.sport?.toUpperCase() !== 'MLB')) return NextResponse.json({ post: previous })
  }
  if (payload.groupId) {
    if (!UUID.test(payload.groupId)) return NextResponse.json({ error: 'Choose a valid community.' }, { status: 400 })
    const { data: group } = await gate.admin.from('groups').select('id').eq('id', payload.groupId).eq('owner_id', gate.user.id).maybeSingle()
    if (!group) return NextResponse.json({ error: 'Choose one of your communities.' }, { status: 403 })
  }
  if (payload.visibility === 'premium' && !payload.groupId) return NextResponse.json({ error: 'Choose a paid community for member content.' }, { status: 400 })
  if (!gate.mlbAccess && typeof payload.sport === 'string' && payload.sport.toUpperCase() === 'MLB') return NextResponse.json({ error: 'Sport unavailable.' }, { status: 404 })
  const content = typeof payload.content === 'string' ? payload.content.trim() : ''
  const scheduledFor = new Date(payload.scheduledFor ?? '')
  if (!content || content.length > 500) return NextResponse.json({ error: 'Post must be between 1 and 500 characters.' }, { status: 400 })
  if (!payload.draft && (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() + 60_000 || scheduledFor.getTime() > Date.now() + 366 * 86400_000)) return NextResponse.json({ error: 'Choose a time between one minute and one year from now.' }, { status: 400 })
  const rate = await consumeServerRateLimit(gate.user.id, 'creator_schedule_post', 60, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Scheduling is temporarily unavailable.' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Scheduling limit reached. Try again later.' }, { status: 429 })
  const { data, error } = await gate.admin.from('creator_scheduled_posts').insert({
    ...(requestId ? { id: requestId } : {}),
    creator_id: gate.user.id, group_id: payload.groupId || null, content, post_type: payload.postType === 'analysis' ? 'analysis' : 'text',
    sport: SPORTS.has(payload.sport ?? '') ? payload.sport : null,
    visibility: payload.groupId ? 'public' : VISIBILITY.has(payload.visibility ?? '') ? payload.visibility : 'public',
    scheduled_for: payload.draft ? new Date(Date.now() + 366 * 86400_000).toISOString() : scheduledFor.toISOString(),
    status: payload.draft ? 'draft' : 'scheduled',
  }).select(COLUMNS).single()
  if (error?.code === '23505' && requestId) {
    const { data: previous } = await gate.admin.from('creator_scheduled_posts').select(COLUMNS).eq('id', requestId).eq('creator_id', gate.user.id).maybeSingle()
    if (previous && (gate.mlbAccess || previous.sport?.toUpperCase() !== 'MLB')) return NextResponse.json({ post: previous })
  }
  if (error || !data) return safeApiError('creator-scheduled-post-create', error, 'Could not save scheduled post')
  return NextResponse.json({ post: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const gate = await creator(request); if ('error' in gate) return gate.error
  const rate = await consumeServerRateLimit(gate.user.id, 'creator_update_scheduled_post', 180, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Scheduling is temporarily unavailable.' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Update limit reached. Try again later.' }, { status: 429 })
  const body = await request.json().catch(() => null) as { id?: string; action?: 'cancel' | 'schedule' | 'edit'; expectedUpdatedAt?: string; scheduledFor?: string; content?: string; postType?: string; sport?: string; visibility?: string; draft?: boolean; groupId?: string | null } | null
  if (!body?.id || !UUID.test(body.id) || !['cancel', 'schedule', 'edit'].includes(body.action ?? '')) return NextResponse.json({ error: 'Invalid scheduled-post update.' }, { status: 400 })
  if (gate.native && (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt)))) {
    return NextResponse.json({ error: 'Refresh before editing this post.' }, { status: 400 })
  }
  if (!gate.mlbAccess && typeof body.sport === 'string' && body.sport.toUpperCase() === 'MLB') return NextResponse.json({ error: 'Sport unavailable.' }, { status: 404 })
  const updates: Record<string, string | null> = body.action === 'cancel' ? { status: 'canceled' } : { status: body.draft ? 'draft' : 'scheduled' }
  if (body.action === 'schedule' || (body.action === 'edit' && !body.draft)) {
    const when = new Date(body.scheduledFor ?? '')
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 60_000 || when.getTime() > Date.now() + 366 * 86400_000) return NextResponse.json({ error: 'Choose a time between one minute and one year from now.' }, { status: 400 })
    updates.scheduled_for = when.toISOString(); updates.last_error = null
  }
  if (body.action === 'edit') {
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content || content.length > 500) return NextResponse.json({ error: 'Post must be between 1 and 500 characters.' }, { status: 400 })
    if (body.groupId) {
      if (!UUID.test(body.groupId)) return NextResponse.json({ error: 'Choose a valid community.' }, { status: 400 })
      const { data: group } = await gate.admin.from('groups').select('id').eq('id', body.groupId).eq('owner_id', gate.user.id).maybeSingle()
      if (!group) return NextResponse.json({ error: 'Choose one of your communities.' }, { status: 403 })
    }
    if (body.visibility === 'premium' && !body.groupId) return NextResponse.json({ error: 'Choose a paid community for member content.' }, { status: 400 })
    updates.group_id = body.groupId || null
    updates.content = content
    updates.post_type = body.postType === 'analysis' ? 'analysis' : 'text'
    updates.sport = SPORTS.has(body.sport ?? '') ? body.sport! : null
    updates.visibility = body.groupId ? 'public' : VISIBILITY.has(body.visibility ?? '') ? body.visibility! : 'public'
  }
  let query = gate.admin.from('creator_scheduled_posts').update(updates).eq('id', body.id).eq('creator_id', gate.user.id).in('status', ['draft', 'scheduled', 'failed'])
  if (gate.native && body.expectedUpdatedAt) query = query.eq('updated_at', body.expectedUpdatedAt)
  if (!gate.mlbAccess) query = query.or('sport.is.null,sport.not.ilike.MLB')
  const { data, error } = await query.select(COLUMNS).maybeSingle()
  if (error) return safeApiError('creator-scheduled-post-update', error, 'Could not update scheduled post')
  if (!data && gate.native) return NextResponse.json({ error: 'The post changed. Refresh before editing it.' }, { status: 409 })
  if (!data) return NextResponse.json({ error: 'Post unavailable.' }, { status: 404 })
  return NextResponse.json({ post: data })
}

export async function DELETE(request: NextRequest) {
  const gate = await creator(request); if ('error' in gate) return gate.error
  const rate = await consumeServerRateLimit(gate.user.id, 'creator_delete_scheduled_post', 60, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Scheduling is temporarily unavailable.' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Delete limit reached. Try again later.' }, { status: 429 })
  const parameters = new URL(request.url).searchParams
  const id = parameters.get('id')
  const expected = parameters.get('expectedUpdatedAt')
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'Invalid scheduled post.' }, { status: 400 })
  if (gate.native && (!expected || !Number.isFinite(Date.parse(expected)))) return NextResponse.json({ error: 'Refresh before deleting this post.' }, { status: 400 })
  let query = gate.admin.from('creator_scheduled_posts').delete().eq('id', id).eq('creator_id', gate.user.id).in('status', ['draft', 'scheduled', 'failed', 'canceled'])
  if (gate.native && expected) query = query.eq('updated_at', expected)
  if (!gate.mlbAccess) query = query.or('sport.is.null,sport.not.ilike.MLB')
  const { data, error } = await query.select('id').maybeSingle()
  if (error) return safeApiError('creator-scheduled-post-delete', error, 'Could not delete scheduled post')
  if (!data && gate.native) return NextResponse.json({ error: 'The post changed. Refresh before deleting it.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
