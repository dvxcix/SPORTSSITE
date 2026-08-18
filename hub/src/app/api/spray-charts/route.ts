import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'
import { getDailyContactRecap } from '@/lib/dailyContactRecap'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const date = new URL(request.url).searchParams.get('date') ?? ''
  try {
    return NextResponse.json(await getDailyContactRecap(date), {
      headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=30' },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load spray-chart data.' }, { status: 400 })
  }
}
