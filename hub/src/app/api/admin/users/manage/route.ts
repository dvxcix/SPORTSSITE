import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { adminId: user.id }
}

// users.UPDATE/DELETE RLS only allows auth.uid() = id (self-only) — so
// every admin action here on ANOTHER user (verify, change account_type,
// delete) was silently no-op-ing under RLS via the browser client with no
// error surfaced, same root cause "Ban" already worked around by routing
// through the service-role Admin API. This does the same for the rest.
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { userId, action, value } = await req.json().catch(() => ({}))
  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (action === 'verify') {
    const { error } = await admin.from('users').update({ is_verified: !!value }).eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'setType') {
    if (!['user', 'creator', 'admin'].includes(value)) {
      return NextResponse.json({ error: 'value must be user, creator, or admin' }, { status: 400 })
    }
    const { error } = await admin.from('users').update({ account_type: value }).eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    if (userId === auth.adminId) {
      return NextResponse.json({ error: "Can't delete your own account" }, { status: 400 })
    }
    const { error } = await admin.from('users').delete().eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
