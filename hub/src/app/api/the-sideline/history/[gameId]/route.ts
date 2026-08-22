import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHistoricalGamePlays } from '@/app/the-sideline/analysis'

export async function GET(_request: Request, context: { params: Promise<{ gameId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { gameId } = await context.params
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(gameId)) {
    return NextResponse.json({ error: 'Invalid game id' }, { status: 400 })
  }

  try {
    const plays = await getHistoricalGamePlays(gameId)
    return NextResponse.json({ plays }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch {
    return NextResponse.json({ error: 'Historical plays unavailable' }, { status: 500 })
  }
}
