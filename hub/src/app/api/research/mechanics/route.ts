import { NextResponse } from 'next/server'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { requireTier } from '@/lib/requireTier'
import {
  MECHANICS_WINDOWS,
  type MechanicsWindow,
} from '@/lib/hrMechanics'
import { compactMechanicsByPlayer, getGameMechanicsWindows } from '@/lib/hrMechanicsCache'

export const revalidate = 0

function validWindow(value: string | null): MechanicsWindow {
  const parsed = Number(value)
  return MECHANICS_WINDOWS.includes(parsed as MechanicsWindow) ? parsed as MechanicsWindow : 5
}

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const gamePk = Number(searchParams.get('gamePk'))
  const window = validWindow(searchParams.get('window'))
  if (!gamePk) return NextResponse.json({ error: 'A valid gamePk is required.' }, { status: 400 })

  const games = await getTodaysMatchups(date)
  const game = games.find(candidate => candidate.gamePk === gamePk)
  if (!game) return NextResponse.json({ error: 'That game is unavailable for the selected date.' }, { status: 404 })
  if (game.awayLineup.length < 9 || game.homeLineup.length < 9) {
    return NextResponse.json({ error: 'Both nine-player lineups are required for a mechanics comparison.' }, { status: 409 })
  }

  try {
    const { results, cache } = await getGameMechanicsWindows(game, date)
    const compact = searchParams.get('compact') === '1'
    return NextResponse.json(compact
      ? {
          gamePk,
          modelVersion: results[window].modelVersion,
          players: compactMechanicsByPlayer(results),
        }
      : results[window], {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=600',
        'X-SlipSurge-Mechanics-Cache': cache,
      },
    })
  } catch (cause) {
    console.error('[research/mechanics]', cause)
    return NextResponse.json({ error: 'The mechanics model could not be prepared for this game.' }, { status: 500 })
  }
}
