import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data, error } = await supabase
    .from('data_export_requests')
    .select('id,status,requested_at,completed_at,expires_at')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(10)
  if (error) return safeApiError('data-export-list', error)
  return NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const rate = await consumeServerRateLimit(user.id, 'account_data_export', 3, 24 * 60 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Data export is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Data export limit reached. Try again later.' }, { status: 429 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('data_export_requests')
    .select('id,status,requested_at,completed_at,expires_at')
    .eq('user_id', user.id)
    .in('status', ['queued', 'processing', 'ready'])
    .maybeSingle()
  if (existing) return NextResponse.json({ request: existing, existing: true })

  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data, error } = await admin.from('data_export_requests').insert({
    user_id: user.id,
    status: 'ready',
    delivery_email: user.email ?? null,
    completed_at: now.toISOString(),
    expires_at: expires.toISOString(),
    metadata: { format: 'json', generated_on_download: true },
  }).select('id,status,requested_at,completed_at,expires_at').single()
  if (error) return safeApiError('data-export-create', error, 'Could not create a data export.')
  return NextResponse.json({ request: data }, { status: 201 })
}
