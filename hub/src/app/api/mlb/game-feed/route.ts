import { getMLBGameFeed } from '@/lib/mlb-api'
import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const gamePk = searchParams.get('gamePk')
  if (!gamePk) return NextResponse.json({ error: 'missing gamePk' }, { status: 400 })

  const feed = await getMLBGameFeed(gamePk)
  if (!feed) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ feed })
}
