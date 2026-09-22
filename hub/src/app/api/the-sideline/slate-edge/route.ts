import { NextRequest, NextResponse } from 'next/server'
import { requireNflAccess } from '@/lib/nflAccess'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import { contextualNflScore } from '@/lib/nflContextScore'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import { normalizeNflPlayerName } from '@/lib/nflPlayerName'
import { defaultNflSample, nflSampleReference, parseNflSample, type NflSample } from '@/lib/nflSample'
import {
  NFL_SLATE_EDGE_MARKETS,
  type NflSlateEdgeEntry,
  type NflSlateEdgeMarket,
  type NflSlateEdgeMarketKey,
  type NflSlateEdgePayload,
} from '@/lib/nflSlateEdge'
import { getCachedSidelineBoardLens, getSidelineGames, getSidelineOddsBundle } from '@/app/the-sideline/data'
import type { NflMarketOffer, NflOddsPlayer } from '@/lib/nflOddsTypes'

export const dynamic = 'force-dynamic'

const normalizedTeam = (value: string) => value.trim().toUpperCase()
const currentOdds = (offer: NflMarketOffer | null) => offer
  ? offer.type === 'milestone' ? offer.current.odds ?? null : offer.current.over ?? null
  : null
const openingOdds = (offer: NflMarketOffer | null) => offer?.opening
  ? offer.type === 'milestone' ? offer.opening.odds ?? null : offer.opening.over ?? null
  : null

function primaryOffer(player: NflOddsPlayer, propType: NflSlateEdgeMarketKey) {
  const market = nflPrimaryMarket(player, propType, 'fanduel') ?? nflPrimaryMarket(player, propType)
  if (!market) return { market: null, offer: null }
  const offer = market.offers.find(item => normalizeNflPlayerName(item.vendor) === 'fanduel')
    ?? market.offers.find(item => currentOdds(item) != null)
    ?? null
  return { market, offer }
}

function marketSnapshot(player: NflOddsPlayer, propType: NflSlateEdgeMarketKey): NflSlateEdgeMarket {
  const { market, offer } = primaryOffer(player, propType)
  const line = offer?.line ?? market?.line ?? null
  const comparable = market?.offers.filter(item => item.type === 'milestone' || item.line === line) ?? []
  const prices = comparable.flatMap(item => {
    const value = currentOdds(item)
    return value == null ? [] : [value]
  })
  const counts = (player.publicPicks ?? []).filter(item => item.propType === propType).map(item => item.picks)
  return {
    label: market?.label ?? NFL_SLATE_EDGE_MARKETS.find(item => item.key === propType)?.label ?? propType,
    line,
    openingLine: offer?.openingLine ?? null,
    odds: currentOdds(offer),
    openingOdds: openingOdds(offer),
    vendor: offer?.vendor ?? null,
    picks: counts.length ? Math.max(...counts) : null,
    bookGap: prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : null,
    books: comparable.filter(item => currentOdds(item) != null).map(item => item.vendor),
  }
}

function marketExpectation(market: NflSlateEdgeMarket, propType: NflSlateEdgeMarketKey) {
  const probability = americanImpliedProbability(market.odds)
  if (probability == null) return null
  if (propType.includes('td')) return probability
  return market.line == null
    ? probability
    : market.line + (probability - 0.5) * Math.max(Math.abs(market.line), 1) * 0.35
}

export async function GET(request: NextRequest) {
  const gate = await requireNflAccess()
  if (gate.error) return gate.error

  const requestedDate = request.nextUrl.searchParams.get('date') ?? undefined
  const requestedSample = request.nextUrl.searchParams.get('sample')
  const explicitSample: NflSample | null = requestedSample ? parseNflSample(requestedSample) : null
  const { games, date } = await getSidelineGames(requestedDate)

  const gameResults = await Promise.all(games.map(async game => {
    const bundle = await getSidelineOddsBundle(game)
    const roster = bundle.odds.players.map(player => ({
      id: player.gsisId ?? `bdl-${player.id}`,
      bdlId: player.id,
      teamId: player.teamId ?? null,
      team: player.team,
      name: player.name,
      position: player.position,
    }))
    const sample = explicitSample ?? defaultNflSample(game)
    const lens = await getCachedSidelineBoardLens(game, roster, sample)
    const windowData = lens.windows.season
    const trackedById = new Map(windowData.players.map(player => [player.id, player]))
    const trackedByName = new Map(windowData.players.map(player => [normalizeNflPlayerName(player.name), player]))
    const profiles = new Map(windowData.teams.map(item => [normalizedTeam(item.team.abbr), item]))
    const gameLine = bundle.odds.gameLines.find(item => normalizeNflPlayerName(item.vendor) === 'fanduel') ?? bundle.odds.gameLines[0]
    const teams = new Set([normalizedTeam(game.away.abbr), normalizedTeam(game.home.abbr)])

    const entries: NflSlateEdgeEntry[] = bundle.odds.players
      .filter(player => teams.has(normalizedTeam(player.team)) && player.availability?.active !== false)
      .map(player => {
        const tracked = (player.gsisId ? trackedById.get(player.gsisId) : null)
          ?? trackedByName.get(normalizeNflPlayerName(player.name))
          ?? null
        const team = normalizedTeam(player.team)
        const teamProfile = profiles.get(team) ?? null
        const opponentProfile = profiles.get(team === normalizedTeam(game.away.abbr) ? normalizedTeam(game.home.abbr) : normalizedTeam(game.away.abbr)) ?? null
        const markets = Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(item => [item.key, marketSnapshot(player, item.key)])) as Record<NflSlateEdgeMarketKey, NflSlateEdgeMarket>
        const teamMoneyline = team === normalizedTeam(game.home.abbr) ? gameLine?.moneylineHome : gameLine?.moneylineAway
        const score = Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(item => [
          item.key,
          tracked
            ? contextualNflScore({ ...tracked, teamProfile, opponentProfile }, item.key, americanImpliedProbability(teamMoneyline ?? null), gameLine?.total ?? null).score
            : null,
        ])) as Record<NflSlateEdgeMarketKey, number | null>
        const teamInfo = team === normalizedTeam(game.away.abbr) ? game.away : game.home
        const roleShare = tracked
          ? ['RB', 'FB'].includes(player.position) ? tracked.carryShare : player.position === 'QB' ? 0 : tracked.targetShare
          : null
        return {
          id: player.gsisId ?? `bdl-${player.id}`,
          gameId: game.id,
          gameLabel: `${game.away.abbr} at ${game.home.abbr}`,
          awayAbbr: game.away.abbr,
          awayLogo: game.away.logo,
          homeAbbr: game.home.abbr,
          homeLogo: game.home.logo,
          team,
          teamLogo: teamInfo.logo,
          name: player.name,
          position: player.position,
          headshot: player.headshot ?? tracked?.headshot ?? null,
          games: tracked?.games ?? 0,
          score,
          mm: Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(item => [item.key, null])) as Record<NflSlateEdgeMarketKey, number | null>,
          markets,
          volume: tracked?.volume ?? null,
          redZone: tracked?.redZone ?? null,
          breakaway: tracked?.breakaway ?? null,
          evidence: tracked?.evidence ?? null,
          roleShare,
          redZoneLooks: tracked?.redZoneLooks ?? null,
          explosivePlays: tracked?.explosivePlays ?? null,
          dvp: tracked?.dvp ?? {},
        }
      })
    return { game, sample, entries }
  }))

  const entries = gameResults.flatMap(result => result.entries)
  for (const market of NFL_SLATE_EDGE_MARKETS) {
    const performance = entries.filter(entry => entry.score[market.key] != null)
      .sort((a, b) => (b.score[market.key] ?? -1) - (a.score[market.key] ?? -1))
    const sportsbook = entries
      .map(entry => ({ entry, expectation: marketExpectation(entry.markets[market.key], market.key) }))
      .filter((item): item is { entry: NflSlateEdgeEntry; expectation: number } => item.expectation != null)
      .sort((a, b) => b.expectation - a.expectation)
    const performanceRank = new Map(performance.map((entry, index) => [entry.id + entry.gameId, index + 1]))
    const sportsbookRank = new Map(sportsbook.map((item, index) => [item.entry.id + item.entry.gameId, index + 1]))
    entries.forEach(entry => {
      const key = entry.id + entry.gameId
      const model = performanceRank.get(key)
      const book = sportsbookRank.get(key)
      entry.mm[market.key] = model != null && book != null ? book - model : null
    })
  }

  const sampleLabels = new Set(gameResults.map(result => nflSampleReference(result.game.season, result.sample).label))
  const payload: NflSlateEdgePayload = {
    date,
    sampleLabel: [...sampleLabels].join(' / '),
    games: games.map(game => ({
      id: game.id,
      label: `${game.away.abbr} at ${game.home.abbr}`,
      awayAbbr: game.away.abbr,
      awayLogo: game.away.logo,
      homeAbbr: game.home.abbr,
      homeLogo: game.home.logo,
    })),
    entries,
  }
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, max-age=20' } })
}
