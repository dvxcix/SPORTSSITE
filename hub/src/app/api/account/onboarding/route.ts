import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { saveAccountOnboarding } from '@/lib/accountOnboardingServer'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Your session expired. Sign in again to finish setup.', code: 'SESSION_EXPIRED' }, { status: 401 })
  }
  return saveAccountOnboarding(request, user.id)
}
