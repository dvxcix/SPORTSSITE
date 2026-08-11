import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// platform_settings only grants public SELECT via RLS; writes go through the
// service-role client after we've verified admin status above.
export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null)
  if (!body || typeof body.key !== 'string' || body.value === undefined) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  }
  if (body.key !== 'fee_independent_creator_pct') {
    return NextResponse.json({ error: 'Unsupported platform setting' }, { status: 400 })
  }
  const value = Number(body.value)
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return NextResponse.json({ error: 'Creator platform fee must be between 0 and 100' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('platform_settings')
    .upsert({ key: body.key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return safeApiError('admin-platform-setting', error)

  return NextResponse.json({ ok: true })
}
