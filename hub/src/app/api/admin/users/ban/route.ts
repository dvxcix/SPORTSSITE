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

// Ban state lives in Supabase Auth (auth.users.banned_until) — there's no
// column for it on public.users, so this has to go through the Admin Auth
// API with the service-role key, not a normal table update.
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { userId, ban } = await req.json().catch(() => ({}))
  if (!userId || typeof ban !== 'boolean') {
    return NextResponse.json({ error: 'userId and ban (boolean) are required' }, { status: 400 })
  }
  if (userId === auth.adminId) {
    return NextResponse.json({ error: "Can't ban your own account" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    // GoTrue takes a duration string, not a target date — "876000h" ≈ 100
    // years (its own documented convention for "indefinitely"). "none"
    // instead of "0h" is the documented way to lift a ban.
    ban_duration: ban ? '876000h' : 'none',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, banned: ban })
}
