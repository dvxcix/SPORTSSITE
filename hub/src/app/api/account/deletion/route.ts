import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { safeApiError } from '@/lib/safeApiError'

const OPEN_STATUSES = ['pending', 'reviewing', 'scheduled', 'blocked']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data, error } = await supabase.from('account_deletion_requests')
    .select('id,status,requested_at,scheduled_for,resolution_note')
    .eq('user_id', user.id).order('requested_at', { ascending: false }).limit(5)
  if (error) return safeApiError('account-deletion-list', error)
  return NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { confirmation?: string; reason?: string }
  if (body.confirmation !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin.from('account_deletion_requests')
    .select('id,status,requested_at,scheduled_for,resolution_note')
    .eq('user_id', user.id).in('status', OPEN_STATUSES).maybeSingle()
  if (existing) return NextResponse.json({ request: existing, existing: true })

  const { data, error } = await admin.from('account_deletion_requests').insert({
    user_id: user.id,
    reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) || null : null,
  }).select('id,status,requested_at,scheduled_for,resolution_note').single()
  if (error) return safeApiError('account-deletion-create', error, 'Could not schedule account deletion.')
  return NextResponse.json({ request: data }, { status: 201 })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('account_deletion_requests').update({
    status: 'canceled', canceled_at: new Date().toISOString(),
  }).eq('user_id', user.id).in('status', ['pending', 'reviewing', 'blocked'])
    .select('id,status,requested_at,scheduled_for,resolution_note').maybeSingle()
  if (error) return safeApiError('account-deletion-cancel', error, 'Could not cancel account deletion.')
  return NextResponse.json({ request: data })
}
