import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readHrIntelligence } from '@/lib/adminHrIntelligence'
import { MLB_HIBERNATING, mlbPausedResponse } from '@/lib/mlbOffseason'

export const revalidate = 0
export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function GET(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  if (MLB_HIBERNATING) return mlbPausedResponse(503)

  return readHrIntelligence(request)
}
