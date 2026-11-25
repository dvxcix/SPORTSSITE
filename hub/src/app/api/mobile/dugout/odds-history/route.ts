import { NextResponse } from 'next/server'
import { GET as dugout } from '@/app/api/mobile/dugout/route'
import { GET as history } from '@/app/api/odds-terminal/route'
import { nativeMlbOddsHistory } from '@/lib/nativeMlbOddsHistory'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 90
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (!await canViewMlb(account.supabase, account.userId)) return reply({ error: 'MLB research is unavailable for this account' }, 403)
  const tier = await requireTier('ultimate')
  if (tier.error) return tier.error
  if (tier.userId !== account.userId) return reply({ error: 'Sign in required' }, 401)

  const query = new URL(request.url).searchParams
  const date = query.get('date') ?? '', gamePk = query.get('gamePk') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
    || !/^[1-9][0-9]{0,9}$/.test(gamePk)) return reply({ error: 'Choose a valid game and slate date' }, 400)

  try {
    const boardURL = new URL('/api/mobile/dugout', request.url)
    boardURL.search = new URLSearchParams({ date, mode: 'pregame' }).toString()
    const slate = await dugout(new Request(boardURL, { headers: request.headers }))
    if (!slate.ok) return slate
    type Players = Parameters<typeof nativeMlbOddsHistory>[0]
    const board = await slate.json() as { date: string; games: { id: number; key: string; homeLineup: Players; awayLineup: Players }[] }
    const game = board.date === date ? board.games.find(item => item.id === Number(gamePk)) : null
    if (!game) return reply({ error: 'Matchup is not on this slate' }, 404)

    const historyURL = new URL('/api/odds-terminal', request.url)
    historyURL.search = new URLSearchParams({ date, gamePk, gameKey: game.key }).toString()
    const response = await history(new Request(historyURL, { headers: request.headers }))
    if (!response.ok) return response
    const captured = await response.json() as { date: string; gamePk: string; sourceCount: number; firstPitchAt: string | null;
      snapshots: Parameters<typeof nativeMlbOddsHistory>[1] }
    if (captured.date !== date || captured.gamePk !== gamePk) return reply({ error: 'The archived matchup could not be confirmed' }, 503)
    const series = nativeMlbOddsHistory([...game.homeLineup, ...game.awayLineup], captured.snapshots, captured.firstPitchAt)
    return reply({ date, gameId: game.id, sourceCount: captured.sourceCount, firstPitchAt: captured.firstPitchAt, series })
  } catch {
    return reply({ error: 'Odds history is temporarily unavailable' }, 503)
  }
}
