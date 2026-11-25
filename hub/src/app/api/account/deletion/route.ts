import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { safeApiError } from '@/lib/safeApiError'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const OPEN_STATUSES = ['pending', 'reviewing', 'scheduled', 'blocked']

async function deletionAccount(request: Request) {
  if (request.headers.has('authorization')) return requireNativeAccount(request)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? { supabase, userId: user.id } : { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
}

export async function GET(request: Request) {
  const account = await deletionAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const { data, error } = await supabase.from('account_deletion_requests')
    .select('id,status,requested_at,scheduled_for,resolution_note')
    .eq('user_id', userId).order('requested_at', { ascending: false }).limit(5)
  if (error) return safeApiError('account-deletion-list', error)
  return NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const account = await deletionAccount(request)
  if (account.error) return account.error
  const { userId } = account
  const body = await request.json().catch(() => ({})) as { confirmation?: string; reason?: string }
  if (body.confirmation !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 })

  const admin = createAdminClient()
  const find = () => admin.from('account_deletion_requests')
    .select('id,status,requested_at,scheduled_for,resolution_note')
    .eq('user_id', userId).in('status', OPEN_STATUSES).maybeSingle()
  const { data: existing, error: lookupError } = await find()
  if (lookupError) return safeApiError('account-deletion-list', lookupError)
  if (existing) return NextResponse.json({ request: existing, existing: true })

  const { data, error } = await admin.from('account_deletion_requests').insert({
    user_id: userId,
    reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) || null : null,
  }).select('id,status,requested_at,scheduled_for,resolution_note').single()
  if (error?.code === '23505') {
    const retry = await find()
    if (retry.data) return NextResponse.json({ request: retry.data, existing: true })
  }
  if (error) return safeApiError('account-deletion-create', error, 'Could not schedule account deletion.')
  return NextResponse.json({ request: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const account = await deletionAccount(request)
  if (account.error) return account.error
  const { userId } = account
  const admin = createAdminClient()
  const { data, error } = await admin.from('account_deletion_requests').update({
    status: 'canceled', canceled_at: new Date().toISOString(),
  }).eq('user_id', userId).in('status', ['pending', 'reviewing', 'blocked'])
    .select('id,status,requested_at,scheduled_for,resolution_note').maybeSingle()
  if (error) return safeApiError('account-deletion-cancel', error, 'Could not cancel account deletion.')
  return NextResponse.json({ request: data })
}
