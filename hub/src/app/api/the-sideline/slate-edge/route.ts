import { NextRequest, NextResponse } from 'next/server'
import { requireNflAccess } from '@/lib/nflAccess'
import { parseNflSample, type NflSample } from '@/lib/nflSample'
import { getSidelineGames } from '@/app/the-sideline/data'
import { getNflSlatePayload } from '@/lib/nflSlateData'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireNflAccess()
  if (gate.error) return gate.error

  const requestedDate = request.nextUrl.searchParams.get('date') ?? undefined
  const requestedSample = request.nextUrl.searchParams.get('sample')
  const explicitSample: NflSample | null = requestedSample ? parseNflSample(requestedSample) : null
  const { games, date } = await getSidelineGames(requestedDate)
  const payload = await getNflSlatePayload(games, date, explicitSample)
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
}
