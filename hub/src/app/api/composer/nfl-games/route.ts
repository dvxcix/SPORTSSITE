import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSidelineGames, getSidelineOddsBundle } from '@/app/the-sideline/data'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import type { NflMarketOffer } from '@/lib/nflOddsTypes'

export const revalidate = 0

function currentOffers(offer: NflMarketOffer) {
  if (offer.type === 'milestone') {
    return offer.current.odds == null ? [] : [{ side: 'milestone', odds: offer.current.odds }]
  }
  return [
    offer.current.over == null ? null : { side: 'over', odds: offer.current.over },
    offer.current.under == null ? null : { side: 'under', odds: offer.current.under },
  ].filter(Boolean)
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const requestedDate = searchParams.get('date') ?? undefined
  const { games, date } = await getSidelineGames(requestedDate)
  const now = Date.now()
  const payload = await Promise.all(games.map(async game => {
    const { odds } = await getSidelineOddsBundle(game)
    const kickoff = nflKickoffAt(game)
    const status = kickoff && kickoff.getTime() <= now ? 'Live' : 'Preview'
    return {
      gameKey: game.id,
      gamePk: game.id,
      gameDate: game.gameday,
      gameTime: game.gametime,
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      homeLogo: game.home.logo,
      awayLogo: game.away.logo,
      status,
      players: odds.players.map(player => ({
        player_id: player.gsisId ?? `bdl:${player.id}`,
        source_player_id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        headshot_url: player.headshot ?? player.headshotFallbacks?.[0] ?? null,
        markets: player.markets.map(market => ({
          key: market.key,
          prop_type: market.propType,
          label: market.label,
          line: market.line,
          offers: market.offers.flatMap(offer => currentOffers(offer).map(value => ({
            vendor: offer.vendor,
            ...value,
          }))),
        })).filter(market => market.offers.length > 0),
      })).filter(player => player.markets.length > 0),
    }
  }))

  return NextResponse.json({ date, games: payload }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
