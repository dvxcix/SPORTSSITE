import type { Metadata } from 'next'
import { packSidelineBoard } from '@/lib/sidelineWire'
import { notFound } from 'next/navigation'
import { defaultNflSample, parseNflSample, nflSampleReference } from '@/lib/nflSample'
import { requireNflAccess } from '@/lib/nflAccess'
import { AuthTemporarilyUnavailableError } from '@/lib/supabase/authErrors'
import { SidelineBoardClient } from './SidelineBoardClient'
import { SidelineResearchClient } from './SidelineResearchClient'
import { SidelineNavigation } from './SidelineNavigation'
import { SidelineMatchupLab } from './SidelineMatchupLab'
import { SidelineCheatsheets } from './SidelineCheatsheets'
import { getCachedSidelineBoardLens, getCachedSidelineCheatsheetLens, getSidelineGames, getSidelineOddsBundle, getSidelinePregameWeather } from './data'
import { CalendarOff } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import { getNflTouchdownFeed } from '@/lib/nflTouchdownFeed'
import { getNflPublicResults } from '@/lib/nflPublicResultsServer'
import { nflPregameOpen } from '@/lib/nflPregameResearchData'
import { NflPregameBoundary } from './NflPregameBoundary'
import { LiveNflScorerProvider } from '@/components/sideline/NflScorerBadges'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Sideline - SlipSurge',
  description: 'Private NFL market, matchup, tracking and historical-play intelligence suite.',
  robots: { index: false, follow: false, nocache: true },
}

function PregameResearchNotice({ lens }: { lens: { status: string; headline: string; headlineDetail: string } }) {
  if (lens.status !== 'awaiting-data' || lens.headline !== 'Pregame research unavailable') return null
  return <section role="status" className="mx-3 my-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm">
    <strong>{lens.headline}</strong>
    <p className="mt-1 text-slate-300">{lens.headlineDetail}</p>
  </section>
}

export default async function SidelinePage({ searchParams }: {
  searchParams: Promise<{ game?: string | string[]; date?: string | string[]; mode?: string | string[]; sample?: string | string[]; at?: string | string[] }>
}) {
  const gate = await requireNflAccess()
  if (gate.error?.status === 503) throw new AuthTemporarilyUnavailableError()
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
  const beganOpen = nflPregameOpen(selected)
  const sample = requestedSample
    ? parseNflSample(requestedSample)
    : defaultNflSample(selected)
  const navigation = <><NflPregameBoundary game={selected} wasOpen={beganOpen} /><SidelineNavigation games={games} days={days} selected={selected} sample={sample} mode={mode} /></>

  // Only the board needs Market Story. Its lightweight timestamp index is
  // fetched by the client after the useful first screen has rendered. The
  // Public, Sportsbooks and Matchup Lab tabs should never wait on an archive.
  const [initialMarket, touchdownFeed, initialWeather] = await Promise.all([
    getSidelineOddsBundle(selected),
    getNflTouchdownFeed(date).catch(() => {
      console.error('[the-sideline] initial touchdown feed unavailable')
      return null
    }),
    mode === '' ? getSidelinePregameWeather(selected) : Promise.resolve(undefined),
  ])
  let market = initialMarket
  let weatherSummary = initialWeather
  if (mode === 'cheatsheets') {
    let lens = await getCachedSidelineCheatsheetLens(selected, sample)
    if (beganOpen && !nflPregameOpen(selected)) [market, lens] = await Promise.all([getSidelineOddsBundle(selected), getCachedSidelineCheatsheetLens(selected, sample)])
    return <>{navigation}<PregameResearchNotice lens={lens} /><LiveNflScorerProvider key={selected.id + sample} gameId={selected.id} events={touchdownFeed?.filter(event => event.gameId === selected.id) ?? null}><SidelineCheatsheets lens={lens} board={market.odds} sampleLabel={nflSampleReference(selected.season, sample).label} isAdmin={gate.isAdmin} /></LiveNflScorerProvider></>
  }
  if (mode === 'public' || mode === 'markets') {
    const results = mode === 'public' ? await getNflPublicResults(selected, market.odds.bdlGameId).catch(() => null) : null
    if (beganOpen && !nflPregameOpen(selected)) market = await getSidelineOddsBundle(selected)
    return <>{navigation}<SidelineResearchClient
    key={selected.id + mode} mode={mode} board={market.odds} teams={[selected.away, selected.home]}
    gameId={selected.id} initialResults={results}
    title={`${selected.away.abbr} @ ${selected.home.abbr} · ${date}`}
    boardHref={`/the-sideline?date=${date}&game=${encodeURIComponent(selected.id)}&sample=${sample}`} /></>
  }
  const roster = market.odds.players.map(player => ({
    id: player.gsisId ?? `bdl-${player.id}`,
    bdlId: player.id,
    teamId: player.teamId ?? null,
    team: player.team,
    name: player.name,
    position: player.position,
  }))
  let lens = await getCachedSidelineBoardLens(selected, roster, sample)
  if (beganOpen && !nflPregameOpen(selected)) [market, lens, weatherSummary] = await Promise.all([
    getSidelineOddsBundle(selected), getCachedSidelineBoardLens(selected, roster, sample), mode === '' ? getSidelinePregameWeather(selected) : Promise.resolve(undefined),
  ])
  if (mode === 'research') return <>{navigation}<PregameResearchNotice lens={lens} /><SidelineMatchupLab key={selected.id + sample} lens={lens} board={market.odds} /></>
  return <>{navigation}<PregameResearchNotice lens={lens} /><SidelineBoardClient key={selected.id + sample} games={games.map(game => game.id === selected.id ? { ...game, weatherSummary } : game)} selectedId={selected.id} sample={sample} lens={lens} odds={packSidelineBoard(market.odds)} gameState={market.gameState} touchdowns={touchdownFeed} timeline={[]} initialCapture={requestedCapture} /></>
}
