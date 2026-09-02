import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildHrGameIntelligenceReport } from '@/lib/hrGameIntelligenceReport'

export const revalidate = 0
export const maxDuration = 300

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const date = new URL(request.url).searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pass a valid YYYY-MM-DD date.' }, { status: 400 })
  return NextResponse.json(await buildHrGameIntelligenceReport(date), {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
