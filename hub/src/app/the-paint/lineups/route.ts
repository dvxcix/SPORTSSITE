import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintGame } from '@/lib/nbaPaintData'
import { getNbaGameLineups } from '@/lib/nbaLineupsData'
import { nbaOddsMode } from '@/lib/nbaOddsMode'

export const maxDuration = 60
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const id = request.nextUrl.searchParams.get('game'), headers = { 'Cache-Control': 'private, no-store' }
  if (!id || !/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: 'Choose a matchup' }, { status: 400, headers })
  try {
    return NextResponse.json(await getNbaGameLineups(await getPaintGame(Number(id)), nbaOddsMode(request.nextUrl.searchParams.get('mode'))), { headers })
  } catch { return NextResponse.json({ error: 'Lineups could not refresh' }, { status: 503, headers }) }
}
