import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildHrIntelligenceSlate } from '@/lib/hrIntelligenceData'

export const revalidate = 0
export const maxDuration = 300

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

  const url = new URL(request.url)
  const date = url.searchParams.get('date') ?? ''
  const rawGamePk = url.searchParams.get('gamePk')
  const gamePk = rawGamePk == null ? undefined : Number(rawGamePk)
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Pass date as YYYY-MM-DD.' }, { status: 400 })
  }
  if (rawGamePk != null && (!Number.isInteger(gamePk) || Number(gamePk) <= 0)) {
    return NextResponse.json({ error: 'gamePk must be a positive integer.' }, { status: 400 })
  }

  try {
    const result = await buildHrIntelligenceSlate(date, gamePk)
    if (gamePk != null && result.games.length === 0) {
      return NextResponse.json({ error: 'That game was not found on the selected slate.' }, { status: 404 })
    }
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('[hr-intelligence] analysis failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Analysis failed.' }, { status: 500 })
  }
}
