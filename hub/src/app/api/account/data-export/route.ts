import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { accountSettingsActor } from '@/lib/supabase/accountSettingsActor'

export async function GET(request: Request) {
  const account = await accountSettingsActor(request)
  if (account.error) return account.error
  const { supabase, user } = account

  const { data, error } = await supabase
    .from('data_export_requests')
    .select('id,status,requested_at,completed_at,expires_at')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(10)
  if (error) return safeApiError('data-export-list', error)
  return NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const account = await accountSettingsActor(request)
  if (account.error) return account.error
  const { user } = account

  const rate = await consumeServerRateLimit(user.id, 'account_data_export', 3, 24 * 60 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Data export is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Data export limit reached. Try again later.' }, { status: 429 })

  const admin = createAdminClient()
  const now = new Date()
  const expired = await admin.from('data_export_requests').update({ status: 'canceled' })
    .eq('user_id', user.id).eq('status', 'ready').lt('expires_at', now.toISOString())
  if (expired.error) return safeApiError('data-export-expire', expired.error)

  const find = () => admin
    .from('data_export_requests')
    .select('id,status,requested_at,completed_at,expires_at')
    .eq('user_id', user.id)
    .in('status', ['queued', 'processing', 'ready'])
    .maybeSingle()
  const { data: existing, error: lookupError } = await find()
  if (lookupError) return safeApiError('data-export-list', lookupError)
  if (existing) return NextResponse.json({ request: existing, existing: true })

  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data, error } = await admin.from('data_export_requests').insert({
    user_id: user.id,
    status: 'ready',
    delivery_email: user.email ?? null,
    completed_at: now.toISOString(),
    expires_at: expires.toISOString(),
    metadata: { format: 'json', generated_on_download: true },
  }).select('id,status,requested_at,completed_at,expires_at').single()
  if (error?.code === '23505') {
    const retry = await find()
    if (retry.data) return NextResponse.json({ request: retry.data, existing: true })
  }
  if (error) return safeApiError('data-export-create', error, 'Could not create a data export.')
  return NextResponse.json({ request: data }, { status: 201 })
}
