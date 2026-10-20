import { NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintSchedule, getPaintRoster, getPaintPrices } from '@/lib/nbaPaintData'
import { nbaComposerGame } from '@/lib/nbaComposer'
import { hydrateNbaPlayers } from '@/lib/nbaDirectory'

export const maxDuration = 60
export async function GET(request: Request) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  try {
    const { games, date } = await getPaintSchedule(new URL(request.url).searchParams.get('date') ?? undefined)
    const payload = await Promise.all(games.map(async game => {
      const [roster, prices] = await Promise.all([getPaintRoster(game), getPaintPrices(game, 'pregame')])
      const portraits = new Map((await hydrateNbaPlayers(roster)).map(player => [`bdl:${player.id}`, player.headshot]))
      const result = nbaComposerGame(game, roster, prices.props)
      return { ...result, players: result.players.map(player => ({ ...player, headshot_url: portraits.get(player.player_id) ?? null })) }
    }))
    return NextResponse.json({ date, games: payload }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'NBA games could not load. Please try again.' }, { status: 503 }) }
}
