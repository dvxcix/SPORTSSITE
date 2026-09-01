import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVATE_ACCOUNT_COLUMNS } from '@/lib/supabase/userColumns'
import { safeApiError } from '@/lib/safeApiError'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const userId = typeof authData?.claims?.sub === 'string' ? authData.claims.sub : null
  if (authError || !userId) {
    return NextResponse.json({ error: 'Unauthorized', code: 'SESSION_EXPIRED' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('users')
    .select(PRIVATE_ACCOUNT_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  if (error) return safeApiError('account-me', error, 'Could not load account')
  if (!profile) {
    return NextResponse.json({ error: 'Account profile is unavailable', code: 'PROFILE_NOT_FOUND' }, { status: 404 })
  }
  return NextResponse.json({ profile }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
