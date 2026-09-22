import { requireNflAccess } from '@/lib/nflAccess'
import { getSidelineGames } from '../data'
import { getNflPublicResults } from '@/lib/nflPublicResultsServer'

export async function GET(request: Request) {
  const gate = await requireNflAccess()
  if (gate.error) return gate.error
  const id = new URL(request.url).searchParams.get('game') ?? ''
  if (!/^[\w-]{1,64}$/.test(id)) return Response.json({ error: 'Invalid game' }, { status: 400 })
  try {
    const { games } = await getSidelineGames(undefined, id)
    const game = games.find(row => row.id === id)
    if (!game) return Response.json({ error: 'Game not found' }, { status: 404 })
    return Response.json(await getNflPublicResults(game, null), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return Response.json({ error: 'Results temporarily unavailable' }, { status: 503 })
  }
}
