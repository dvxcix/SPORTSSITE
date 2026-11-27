import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { requirePaintAccess } from '@/lib/paintAccess'
import { requireNflAccess } from '@/lib/nflAccess'
import { publicWorkspaceScope } from '@/lib/publicWorkspaceScope'
import { getTeamMatchupArchive } from '@/lib/teamMatchupArchiveData'

export const maxDuration = 45

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const params = new URL(request.url).searchParams
  const league = params.get('league'), game = params.get('game'), date = params.get('date')
  if ((league !== 'nba' && league !== 'nfl') || !game || !date ||
      !(league === 'nba' ? /^[1-9][0-9]{0,9}$/.test(game) : /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(game)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    return reply({ error: 'Choose a valid matchup' }, 400)
  }
  if (publicWorkspaceScope(league)) return reply({ error: 'Member research required' }, 403)
  const gate = await (league === 'nba' ? requirePaintAccess() : requireNflAccess())
  if (gate.error) return gate.error
  try {
    const result = await getTeamMatchupArchive(league, game, date)
    return result ? reply(result) : reply({ error: 'Matchup archive unavailable' }, 404)
  } catch {
    return reply({ error: 'Matchup archive could not load. Try again shortly.' }, 503)
  }
}
