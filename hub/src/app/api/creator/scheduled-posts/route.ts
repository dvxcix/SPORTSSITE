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
  }).select('id').single()
  if (error || !data) return safeApiError('creator-scheduled-post-create', error, 'Could not save scheduled post')
  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const gate = await creator(); if ('error' in gate) return gate.error
  const body = await request.json().catch(() => null) as { id?: string; action?: 'cancel' | 'schedule'; scheduledFor?: string } | null
  if (!body?.id || !UUID.test(body.id) || !['cancel', 'schedule'].includes(body.action ?? '')) return NextResponse.json({ error: 'Invalid scheduled-post update.' }, { status: 400 })
  const updates: Record<string, string | null> = body.action === 'cancel' ? { status: 'canceled' } : { status: 'scheduled' }
  if (body.action === 'schedule') {
    const when = new Date(body.scheduledFor ?? '')
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 60_000) return NextResponse.json({ error: 'Choose a future time.' }, { status: 400 })
    updates.scheduled_for = when.toISOString(); updates.last_error = null
  }
  const { error } = await gate.admin.from('creator_scheduled_posts').update(updates).eq('id', body.id).eq('creator_id', gate.user.id).in('status', ['draft', 'scheduled', 'failed'])
  if (error) return safeApiError('creator-scheduled-post-update', error, 'Could not update scheduled post')
  return NextResponse.json({ ok: true })
}
