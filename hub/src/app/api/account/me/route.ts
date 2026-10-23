import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVATE_ACCOUNT_COLUMNS } from '@/lib/supabase/userColumns'
import { safeApiError } from '@/lib/safeApiError'
import { AUTH_UNAVAILABLE_HEADERS, isRetryableAuthError } from '@/lib/supabase/authErrors'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  let result: Awaited<ReturnType<typeof supabase.auth.getClaims>>
  try {
    result = await supabase.auth.getClaims()
  } catch {
    return NextResponse.json({ error: 'Account verification temporarily unavailable', code: 'AUTH_TEMPORARILY_UNAVAILABLE' }, { status: 503, headers: AUTH_UNAVAILABLE_HEADERS })
  }
  const { data: authData, error: authError } = result
  if (isRetryableAuthError(authError)) {
    return NextResponse.json({ error: 'Account verification temporarily unavailable', code: 'AUTH_TEMPORARILY_UNAVAILABLE' }, { status: 503, headers: AUTH_UNAVAILABLE_HEADERS })
  }
  const userId = typeof authData?.claims?.sub === 'string' ? authData.claims.sub : null
  if (authError || !userId) {
    return NextResponse.json({ error: 'Unauthorized', code: 'SESSION_EXPIRED' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
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
