import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidelineBoardClient } from './SidelineBoardClient'
import { SidelineClient } from './SidelineClient'
import { getCachedSidelineBoardLens, getCachedSidelineLens, getSidelineGames, getSidelineOddsBundle } from './data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Sideline - SlipSurge',
  description: 'Private NFL market, matchup, tracking and historical-play intelligence suite.',
  robots: { index: false, follow: false, nocache: true },
}

export default async function SidelinePage({ searchParams }: {
  searchParams: Promise<{ game?: string | string[]; date?: string | string[]; mode?: string | string[] }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') notFound()

  const params = await searchParams
  const requestedGame = Array.isArray(params.game) ? params.game[0] : params.game
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const mode = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === 'film' ? 'film' : 'board'
  const { games, date } = await getSidelineGames(requestedDate, requestedGame)
  if (!games.length) {
    return <main style={{ minHeight: '100vh', padding: 32, color: '#f5f8fb', background: '#060a0f' }}><h1>The Sideline</h1><p>No NFL games are scheduled for {date}.</p></main>
  }

  const selected = games.find(game => game.id === requestedGame) ?? games[0]
  if (mode === 'film') {
    const lens = await getCachedSidelineLens(selected)
    return <SidelineClient key={selected.id} games={games} selectedId={selected.id} lens={lens} boardHref={`/the-sideline?date=${date}&game=${encodeURIComponent(selected.id)}`} />
  }

  const market = await getSidelineOddsBundle(selected)
  const roster = market.odds.players.map(player => ({
    id: player.gsisId ?? `bdl-${player.id}`,
    bdlId: player.id,
    teamId: player.teamId ?? null,
    team: player.team,
    name: player.name,
    position: player.position,
  }))
  const lens = await getCachedSidelineBoardLens(selected, roster)
  return <SidelineBoardClient key={selected.id} games={games} selectedId={selected.id} selectedDate={date} lens={lens} odds={market.odds} />
}
