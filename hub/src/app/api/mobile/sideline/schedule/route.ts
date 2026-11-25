import { NextResponse } from 'next/server'
import { getSidelineGames } from '@/app/the-sideline/data'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import { requireNflAccess } from '@/lib/nflAccess'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 30

export async function GET(request: Request) {
  const { error } = await requireNativeAccount(request)
  if (error) return error
  const gate = await requireNflAccess()
  if (gate.error) return gate.error

  const date = new URL(request.url).searchParams.get('date')
  const headers = { 'Cache-Control': 'private, no-store' }
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    return NextResponse.json({ error: 'Choose a valid date' }, { status: 400, headers })
  }

  try {
    const schedule = await getSidelineGames(date ?? undefined)
    const games = date && schedule.date !== date ? [] : schedule.games.map(game => ({
      id: game.id,
      kickoff: nflKickoffAt(game)?.toISOString() ?? null,
      away: { abbreviation: game.away.abbr, name: game.away.name, logo: game.away.logo, color: game.away.color, secondary: game.away.color2 },
      home: { abbreviation: game.home.abbr, name: game.home.name, logo: game.home.logo, color: game.home.color, secondary: game.home.color2 },
    }))
    return NextResponse.json({ date: date ?? schedule.date, games }, { headers })
  } catch {
    return NextResponse.json({ error: 'Slate could not load' }, { status: 503, headers })
  }
}
