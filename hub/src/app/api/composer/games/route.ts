import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadMlbComposerGames } from '@/lib/mlbComposerGames'

export const revalidate = 0

// The browser composer requires a signed-in member. Its lean slate reader is
// independent of Ultimate Dugout analytics.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const { games, available } = await loadMlbComposerGames(date)
  return NextResponse.json({ date, games }, available ? {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
  } : undefined)
}
