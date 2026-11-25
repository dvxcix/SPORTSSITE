import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { backtestSavedMatrix } from '@/lib/adminMatrixBacktest'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export const revalidate = 0
export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  if (MLB_HIBERNATING) return NextResponse.json({ error: 'MLB backtesting is paused for the off-season.' }, { status: 503 })

  return backtestSavedMatrix(req, createAdminClient)
}
