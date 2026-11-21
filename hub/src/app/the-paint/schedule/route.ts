import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintSchedule } from '@/lib/nbaPaintData'
import { nbaDate } from '@/lib/nbaPaint'

export const maxDuration = 30
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const date = request.nextUrl.searchParams.get('date'), headers = { 'Cache-Control': 'private, no-store' }
  if (!date || nbaDate(date) !== date) return NextResponse.json({ error: 'Choose a valid date' }, { status: 400, headers })
  try {
    const schedule = await getPaintSchedule(date, true, 30)
    if (!schedule.complete || schedule.date !== date || schedule.games.length > 16) throw new Error('Incomplete schedule')
    // Display-only clock/score updates. These never replace research, odds or
    // pregame cutoffs; those retain their existing authoritative readers.
    return NextResponse.json({ date, games: schedule.games }, { headers })
  } catch { return NextResponse.json({ error: 'Game status could not refresh' }, { status: 503, headers }) }
}
