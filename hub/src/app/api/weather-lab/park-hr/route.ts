import { NextResponse } from 'next/server'
import { loadParkHomeRunHistory } from '@/lib/parkHrHistory'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 900

export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const gamePk = searchParams.get('gamePk')
  if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

  try {
    return NextResponse.json(await loadParkHomeRunHistory(gamePk))
  } catch {
    return NextResponse.json({ error: 'Could not load park HR history' }, { status: 500 })
  }
}
