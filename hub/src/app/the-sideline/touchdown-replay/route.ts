import { NextResponse } from 'next/server'
import { requireNflAccess } from '@/lib/nflAccess'
import { getNflTouchdownFeed } from '@/lib/nflTouchdownFeed'
import { renderNflTouchdownReplayGif } from '@/lib/nflTouchdownReplayGif'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  const gate = await requireNflAccess()
  if (gate.error) return gate.error
  const params = new URL(request.url).searchParams
  const date = params.get('date') ?? ''
  const eventId = params.get('event') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[A-Za-z0-9_-]{1,64}$/.test(eventId)) return NextResponse.json({ error: 'Invalid replay request' }, { status: 400 })
  try {
    const event = (await getNflTouchdownFeed(date)).find(item => item.id === eventId)
    if (!event) return NextResponse.json({ error: 'Touchdown not found' }, { status: 404 })
    const body = await renderNflTouchdownReplayGif(event)
    const name = event.playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'touchdown'
    return new NextResponse(new Uint8Array(body), { headers: { 'Content-Type': 'image/gif', 'Content-Disposition': `attachment; filename="slipsurge-${date}-${name}-touchdown.gif"`, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[nfl-touchdown-replay] render failed', { date, eventId, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Could not render this touchdown replay.' }, { status: 500 })
  }
}
