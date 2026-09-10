import type { Metadata } from 'next'
import Link from 'next/link'
import { packSidelineBoard } from '@/lib/sidelineWire'
import { notFound } from 'next/navigation'
import { parseNflSample } from '@/lib/nflSample'
import { createClient } from '@/lib/supabase/server'
import { SidelineBoardClient } from './SidelineBoardClient'
import { SidelineClient } from './SidelineClient'
import { SidelineResearchClient } from './SidelineResearchClient'
import { SidelineNavigation } from './SidelineNavigation'
import { SidelineMatchupLab } from './SidelineMatchupLab'
import { SidelineCheatsheets } from './SidelineCheatsheets'
import { getCachedSidelineBoardLens, getCachedSidelineCheatsheetLens, getCachedSidelineLens, getSidelineGames, getSidelineOddsBundle } from './data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Sideline - SlipSurge',
  description: 'Private NFL market, matchup, tracking and historical-play intelligence suite.',
  robots: { index: false, follow: false, nocache: true },
}

export default async function SidelinePage({ searchParams }: {
  searchParams: Promise<{ game?: string | string[]; date?: string | string[]; mode?: string | string[]; sample?: string | string[] }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') notFound()

  const params = await searchParams
  const requestedSample = Array.isArray(params.sample) ? params.sample[0] : params.sample
  const requestedGame = Array.isArray(params.game) ? params.game[0] : params.game
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const { games, date, days } = await getSidelineGames(requestedDate, requestedGame)
  if (!games.length) {
    return <main style={{ minHeight: '100vh', padding: 32, color: '#f5f8fb', background: '#060a0f' }}><h1>The Sideline</h1><p>No NFL games are scheduled for {date}.</p><Link href="/the-sideline">Return to the current NFL slate</Link></main>
  }

  const selected = games.find(game => game.id === requestedGame) ?? games[0]
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const seasonStarted = days.some(day => day.season === selected.season && day.gameType === 'REG' && day.date <= today)
  const sample = requestedSample
    ? parseNflSample(requestedSample)
    : selected.gameType === 'PRE' ? 'preseason' : seasonStarted ? 'regular' : 'previous'
  const navigation = <SidelineNavigation games={games} days={days} selected={selected} sample={sample} mode={mode ?? ''} />
  if (mode === 'film') {
    const lens = await getCachedSidelineLens(selected)
    return <>{navigation}<SidelineClient key={selected.id} games={games} selectedId={selected.id} lens={lens} boardHref={`/the-sideline?date=${date}&game=${encodeURIComponent(selected.id)}&sample=${sample}`} /></>
  }

  // Only the board needs Market Story. Its lightweight timestamp index is
  // fetched by the client after the useful first screen has rendered. The
  // Public, Sportsbooks and Matchup Lab tabs should never wait on an archive.
  const market = await getSidelineOddsBundle(selected)
  if (mode === 'cheatsheets') {
    const lens = await getCachedSidelineCheatsheetLens(selected)
    return <>{navigation}<SidelineCheatsheets key={selected.id} lens={lens} board={market.odds} /></>
  }
  if (mode === 'public' || mode === 'markets') return <>{navigation}<SidelineResearchClient
    key={selected.id + mode} mode={mode} board={market.odds} teams={[selected.away, selected.home]}
    title={`${selected.away.abbr} @ ${selected.home.abbr} · ${date}`}
    boardHref={`/the-sideline?date=${date}&game=${encodeURIComponent(selected.id)}&sample=${sample}`} /></>
  const roster = market.odds.players.map(player => ({
    id: player.gsisId ?? `bdl-${player.id}`,
    bdlId: player.id,
    teamId: player.teamId ?? null,
    team: player.team,
    name: player.name,
    position: player.position,
  }))
  const lens = await getCachedSidelineBoardLens(selected, roster, sample)
  if (mode === 'research') return <>{navigation}<SidelineMatchupLab key={selected.id + sample} lens={lens} board={market.odds} /></>
  return <>{navigation}<SidelineBoardClient key={selected.id + sample} games={games} days={days} selectedId={selected.id} selectedDate={date} sample={sample} lens={lens} odds={packSidelineBoard(market.odds)} gameState={market.gameState} timeline={[]} /></>
}
