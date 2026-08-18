import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDailyContactRecap } from '@/lib/dailyContactRecap'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  return data?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  const date = new URL(request.url).searchParams.get('date') ?? ''
  try {
    return NextResponse.json(await getDailyContactRecap(date))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not build the contact recap.' }, { status: 400 })
  }
}
