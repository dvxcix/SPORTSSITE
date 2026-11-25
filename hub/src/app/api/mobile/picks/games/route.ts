import { NextResponse } from 'next/server'
import { GET as nba } from '@/app/api/composer/nba-games/route'
import { GET as nfl } from '@/app/api/composer/nfl-games/route'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { sportTeamColors, sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { nativeMlbPickSlate } from '@/lib/nativeMlbPickMarkets'

export const maxDuration = 90
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const params = new URL(request.url).searchParams
  const sport = params.get('sport'), date = params.get('date')
  if ((sport !== 'NBA' && sport !== 'NFL' && sport !== 'MLB') || (date != null && (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date))) {
    return NextResponse.json({ error: 'Choose a valid slate' }, { status: 400, headers })
  }
  try {
    if (sport === 'MLB') {
      if (!await canViewMlb(account.supabase, account.userId)) {
        return NextResponse.json({ error: 'This league is unavailable for this account' }, { status: 403, headers })
      }
      const day = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      return NextResponse.json({ date: day, sport, paused: MLB_HIBERNATING,
        games: MLB_HIBERNATING ? [] : await nativeMlbPickSlate(day) }, { headers })
    }
    const result = await (sport === 'NBA' ? nba(request) : nfl(request))
    if (!result.ok) return result
    const data = await result.json()
    return NextResponse.json({ ...data, sport, games: data.games.map((game: { players: Array<{ team: string }> }) => ({
      ...game, players: game.players.map(player => ({ ...player, teamLogo: sportTeamLogoUrl(sport, player.team), colors: sportTeamColors(sport, player.team) })),
    })) }, { headers })
  } catch {
    return NextResponse.json({ error: 'Pick markets couldn’t load' }, { status: 503, headers })
  }
}
