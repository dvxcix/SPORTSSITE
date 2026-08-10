import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data, error } = await supabase
    .from('data_export_requests')
    .select('id,status,requested_at,completed_at,expires_at,error')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data }, { status: 201 })
}
