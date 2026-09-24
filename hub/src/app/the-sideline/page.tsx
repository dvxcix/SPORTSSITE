import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NflGameData } from './NflGameData'
import { packSidelineBoard } from '@/lib/sidelineWire'
import { notFound } from 'next/navigation'
import { defaultNflSample, parseNflSample, nflSampleReference } from '@/lib/nflSample'
import { requireNflAccess } from '@/lib/nflAccess'
import { SidelineBoardClient } from './SidelineBoardClient'
import { SidelineResearchClient } from './SidelineResearchClient'
import { SidelineNavigation } from './SidelineNavigation'
import { SidelineMatchupLab } from './SidelineMatchupLab'
import { SidelineCheatsheets } from './SidelineCheatsheets'
import { getCachedSidelineBoardLens, getCachedSidelineCheatsheetLens, getSidelineGames, getSidelineOddsBundle } from './data'
import { CalendarOff } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import { getNflTouchdownFeed } from '@/lib/nflTouchdownFeed'
import { getNflPublicResults } from '@/lib/nflPublicResultsServer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Sideline - SlipSurge',
  description: 'Private NFL market, matchup, tracking and historical-play intelligence suite.',
  robots: { index: false, follow: false, nocache: true },
}

export default async function SidelinePage({ searchParams }: {
  searchParams: Promise<{ game?: string | string[]; date?: string | string[]; mode?: string | string[]; sample?: string | string[]; at?: string | string[] }>
}) {
  const gate = await requireNflAccess()
  if (gate.error) notFound()

  const params = await searchParams
  const requestedSample = Array.isArray(params.sample) ? params.sample[0] : params.sample
  const requestedGame = Array.isArray(params.game) ? params.game[0] : params.game
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const requestedMode = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const mode = ['cheatsheets', 'public', 'markets', 'research'].includes(requestedMode ?? '') ? requestedMode ?? '' : ''
  const requestedCaptureValue = Array.isArray(params.at) ? params.at[0] : params.at
  const requestedCapture = requestedCaptureValue && Number.isFinite(Date.parse(requestedCaptureValue)) ? new Date(requestedCaptureValue).toISOString() : null
  const { games, date, days } = await getSidelineGames(requestedDate, requestedGame)
  if (!games.length) {
    return <ProductPageShell narrow><ProductHero icon={<CalendarOff size={23} />} eyebrow="NFL schedule" title="The Sideline" description="Game-day research boards are organized around scheduled NFL slates." status={date} /><PageState kind="empty" title="No games on this date" message={`There are no NFL games scheduled for ${date}.`} actionLabel="Return to the current NFL slate" actionHref="/the-sideline" /></ProductPageShell>
  }

  const selected = games.find(game => game.id === requestedGame) ?? games[0]
  const sample = requestedSample
    ? parseNflSample(requestedSample)
    : defaultNflSample(selected)
  const navigation = <><SidelineNavigation games={games} days={days} selected={selected} sample={sample} mode={mode} />
    {gate.isAdmin ? <Suspense fallback={null}><NflGameData game={selected} /></Suspense> : null}</>

  // Only the board needs Market Story. Its lightweight timestamp index is
  // fetched by the client after the useful first screen has rendered. The
  // Public, Sportsbooks and Matchup Lab tabs should never wait on an archive.
  const [market, touchdownFeed] = await Promise.all([
    getSidelineOddsBundle(selected),
    getNflTouchdownFeed(date),
  ])
  if (mode === 'cheatsheets') {
    const lens = await getCachedSidelineCheatsheetLens(selected, sample)
    return <>{navigation}<SidelineCheatsheets key={selected.id + sample} lens={lens} board={market.odds} sampleLabel={nflSampleReference(selected.season, sample).label} isAdmin={gate.isAdmin} /></>
  }
  if (mode === 'public' || mode === 'markets') return <>{navigation}<SidelineResearchClient
    key={selected.id + mode} mode={mode} board={market.odds} teams={[selected.away, selected.home]}
    gameId={selected.id} initialResults={mode === 'public' ? await getNflPublicResults(selected, market.odds.bdlGameId).catch(() => null) : null}
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
  return <>{navigation}<SidelineBoardClient key={selected.id + sample} games={games} selectedId={selected.id} sample={sample} lens={lens} odds={packSidelineBoard(market.odds)} gameState={market.gameState} touchdowns={touchdownFeed} timeline={[]} initialCapture={requestedCapture} /></>
}
