import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVATE_ACCOUNT_COLUMNS } from '@/lib/supabase/userColumns'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('users')
    .select(PRIVATE_ACCOUNT_COLUMNS)
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
  return NextResponse.json({ profile }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
