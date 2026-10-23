import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { searchNbaDirectory } from '@/lib/nbaDirectory'

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveAuthedClient()
  if (authError) return authError
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 64)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (query.length < 2) return NextResponse.json({ players: [] }, { headers })
  try {
    const { players } = await searchNbaDirectory(query)
    return NextResponse.json({ players }, { headers })
  } catch { return NextResponse.json({ error: 'Player search is unavailable.', players: [] }, { status: 503, headers }) }
}
