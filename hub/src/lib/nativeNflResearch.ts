import type { SidelineGame, SidelineLens, SidelineWindow } from '@/app/the-sideline/types'
import type { SidelineLens as CheatsheetLens } from '@/app/the-sideline/SidelineClient'
import { nflAvailability, nflHasCurrentMarket, nflMarketExclusion, nflMarketPlayerKey } from './nflAvailability'
import { contextualNflScore, nflScoreContext } from './nflContextScore'
import { americanImpliedProbability, impliedProbabilityRatio } from './nflMarketMath'
import { nflMatchupTeam } from './nflMatchupBoard'
import { contractPicks, estimateLadderPicks, ladderOffers, ladderPrice, observedPropPicks, type LadderSide } from './nflLadders'
import { normalizeNflPlayerName } from './nflPlayerName'
import { addNflMmRanks } from './nflMmRanks'
import type { NflMatrix } from './nflMatrix'
import { nflMatrixMatches } from './nflMatrixMatches'
import { nflPrimaryMarket } from './nflPrimaryMarket'
import { nflUnverifiedScoreInputs } from './nflScoreIntegrity'
import { PROP_FIELDS, hitSummary, modelProbability, projectedValue } from './nflCheatsheetMetrics'
import type { NflMarketOffer, NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'
import { nflWatchlistSelection, watchlistPickPayload } from './nflWatchlist'

const key = (name: string, team: string) => `${nflMatchupTeam(team)}:${normalizeNflPlayerName(name)}`
const identity = (player: NflOddsPlayer) => ({
  id: player.id, name: player.name, team: player.team, position: player.position,
  headshot: player.headshot ?? null, headshotFallbacks: player.headshotFallbacks ?? [],
})

export function nativeNflMismatch(game: SidelineGame, lens: SidelineLens, windowId: SidelineWindow,
  board: SidelineOddsBoard, prop: string, matrices: NflMatrix[],
) {
  const window = lens.windows[windowId]
  const gameLine = board.gameLines.find(line => normalizeNflPlayerName(line.vendor) === 'fanduel') ?? board.gameLines[0]
  const teams = new Set([game.away.abbr, game.home.abbr].map(nflMatchupTeam))
  const marketPlayers = [...new Map([...(board.availabilityPlayers ?? []), ...board.players]
    .filter(player => teams.has(nflMatchupTeam(player.team))).map(player => [nflMarketPlayerKey(player), player])).values()]
  const lookup = new Map(window.players.map(player => [key(player.name, player.team), player]))
  const byId = new Map(window.players.map(player => [player.id, player]))
  const profiles = new Map(window.teams.map(profile => [nflMatchupTeam(profile.team.abbr), profile]))
  const { environment, markets } = nflUnverifiedScoreInputs(board)
  const candidates = marketPlayers.map(market => {
    const tracked = (market.gsisId ? byId.get(market.gsisId) : null) ?? lookup.get(key(market.name, market.team))
    const team = nflMatchupTeam(market.team)
    const home = team === nflMatchupTeam(game.home.abbr)
    const win = americanImpliedProbability((home ? gameLine?.moneylineHome : gameLine?.moneylineAway) ?? null)
    const position = market.position || tracked?.position || ''
    const score = tracked ? contextualNflScore({
      ...tracked, position, teamProfile: profiles.get(team), opponentProfile: profiles.get(nflMatchupTeam(home ? game.away.abbr : game.home.abbr)),
    }, prop, win, gameLine?.total ?? null) : null
    const contextProp = score?.context.propType ?? nflScoreContext(prop, position).propType
    const available = nflAvailability({ availability: market.availability, rosterStatus: market.rosterStatus ?? tracked?.rosterStatus }, game.gameday)
    const marketAvailable = nflHasCurrentMarket(market, contextProp)
    return {
      id: market.gsisId ?? tracked?.id ?? `bdl-${market.id}`, name: market.name, team: market.team, market,
      index: score?.score ?? 0, eligible: available.eligible && marketAvailable, hasTracking: tracked != null,
      contextProp, status: available.label ?? (marketAvailable ? null : 'Unlisted'),
    }
  })
  const ranked = addNflMmRanks([...new Map(candidates.map(row => [row.id, row])).values()])
  const matches = nflMatrixMatches(board, lens.windows, board.availabilityStale ? [] : matrices, ranked, game.away.abbr, game.home.abbr)
  const rows = ranked.map(row => {
    const safe = !board.availabilityStale && !environment && !markets.has(row.contextProp)
    return {
      player: identity(row.market), status: row.status,
      score: row.hasTracking && !board.availabilityStale && !environment ? row.index : null,
      mm: safe ? row.mm : null,
      sportsbookRank: safe && row.mm != null ? row.sportsbookRank : null,
      performanceRank: safe && row.mm != null ? row.performanceRank : null,
      matrices: matches.get(row.id)?.map(({ id, name, color }) => ({ id, name, color })),
    }
  })
  return { rows }
}

export function nativeNflLadders(game: SidelineGame, board: SidelineOddsBoard, ranks: ReturnType<typeof nativeNflMismatch>['rows'],
  prop: string, book: string, kind: NflMarketOffer['type'], side: LadderSide,
) {
  const ranking = new Map(ranks.map(row => [row.player.id, row]))
  const markets = [...new Set(board.players.flatMap(player => player.markets.map(market => market.propType)))].sort()
  const books = [...new Set(board.players.flatMap(player => player.markets.flatMap(market => market.offers.map(offer => offer.vendor))))].sort()
  const rows = board.players.flatMap(player => {
    const ranked = ranking.get(player.id)
    const status = nflAvailability({ availability: player.availability, rosterStatus: player.rosterStatus }, game.gameday)
    const estimated = side === 'over' ? estimateLadderPicks(player, prop, book) : new Map<string, number>()
    const anytime = nflPrimaryMarket(player, 'anytime_td', book)?.offers.find(offer => offer.vendor === book && !offer.isOpeningOnly)
    const seen = new Set<number>()
    const contracts = ladderOffers(player, prop, book, side).flatMap(({ market, offer, line }) => {
      if (offer.type !== kind || line == null || seen.has(line)) return []
      seen.add(line)
      const price = ladderPrice(offer, side)
      const current = offer.isOpeningOnly || !status.eligible || board.availabilityStale ? null : price
      const opening = offer.isOpeningOnly ? price ?? ladderPrice(offer, side, true) : ladderPrice(offer, side, true)
      const probability = americanImpliedProbability(current), openingProbability = americanImpliedProbability(opening)
      const exact = contractPicks(player, prop, line, side, kind)
      const estimate = exact == null ? estimated.get(market.key) ?? null : null
      const pick = current == null ? null : watchlistPickPayload(nflWatchlistSelection(player, market, offer, side, game))
      return [{ line, current, opening, openingOnly: offer.isOpeningOnly === true, openingLine: offer.openingLine ?? null,
        movement: probability != null && openingProbability != null && offer.line === offer.openingLine ?
          Math.round((probability - openingProbability) * 10000) / 100 : null,
        ratio: impliedProbabilityRatio(anytime ? ladderPrice(anytime, 'over') : null, current),
        picks: exact ?? estimate, estimated: estimate != null,
        leg: pick && { ...pick, line: pick.line ?? String(line), headshot_url: pick.headshot_url ?? null },
      }]
    })
    return contracts.length ? [{ player: identity(player), status: status.label, eligible: status.eligible,
      score: status.eligible ? ranked?.score ?? null : null, mm: ranked?.mm ?? null,
      matrices: ranked?.matrices ?? [], picks: observedPropPicks(player, prop), contracts }] : []
  })
  return { rows, books, markets, kind, side }
}

export function nativeNflCheatsheets(lens: CheatsheetLens, board: SidelineOddsBoard, prop: string, book: string) {
  const byId = new Map(lens.players.map(player => [player.id, player]))
  const byName = new Map(lens.players.map(player => [key(player.name, player.team), player]))
  const byLoose = Map.groupBy(lens.players, player => normalizeNflPlayerName(player.name))
  const field = PROP_FIELDS[prop]
  const active = board.availabilityStale ? [] : board.players.filter(player =>
    !nflMarketExclusion(player, lens.season) && nflHasCurrentMarket(player))
  const paired = active.map(player => {
    const matches = byLoose.get(normalizeNflPlayerName(player.name))
    const stats = (player.gsisId ? byId.get(player.gsisId) : null) ??
      byName.get(key(player.name, player.team)) ?? (matches?.length === 1 ? matches[0] : undefined)
    return { player, stats }
  })
  const rows = paired.flatMap(({player, stats}) => {
    const market = nflPrimaryMarket(player, prop, book)
    const offer = market?.offers.find(item => item.vendor === book && !item.isOpeningOnly)
    if (!field || !market || !offer) return []
    const odds = offer.current.over ?? offer.current.odds ?? null
    const opening = offer.opening?.over ?? offer.opening?.odds ?? null
    const probability = americanImpliedProbability(odds), openingProbability = americanImpliedProbability(opening)
    const line = offer.line ?? market.line ?? (prop.includes('td') ? 1 : null)
    const milestone = offer.type === 'milestone' || prop.includes('td')
    const modeled = stats && line != null ? modelProbability(stats, prop, line, milestone) : null
    const picks = (player.publicPicks ?? []).filter(pick => pick.propType === prop && (line == null || pick.line == null || pick.line === line)).map(pick => pick.picks)
    const hits = stats && line != null ? [null, 10, 5, 3, 1].map(window => hitSummary(stats.gameLog, field, line, window, milestone)) : []
    const gameLog = stats?.gameLog.slice(0, 20).flatMap(game => {
      const value = game[field]
      return value != null && Number.isFinite(value) ? [{ id: game.gameId, value }] : []
    }) ?? []
    return [{
      player: identity(player), line, milestone, odds, opening,
      movement: probability != null && openingProbability != null ? (probability - openingProbability) * 100 : null,
      picks: picks.length ? Math.max(...picks) : null, projection: stats ? projectedValue(stats, prop) : null,
      modeled, edge: probability != null && modeled != null ? modeled - probability * 100 : null, hits, gameLog,
    }]
  })
  const explosives = paired.flatMap(({player, stats}) => stats ? [{
    player: identity(player), games: stats.games, deepTargets: stats.deepTargets,
    receiving20: stats.receiving20, receiving30: stats.receiving30, receiving40: stats.receiving40,
    rushing10: stats.rushing10, rushing20: stats.rushing20, rushing30: stats.rushing30, rushing40: stats.rushing40,
  }] : [])
  const books = [...new Set(active.flatMap(player => player.markets.flatMap(market => market.offers.map(offer => offer.vendor))))].sort()
  const markets = [...new Set(active.flatMap(player => player.markets.map(market => market.propType)).filter(market => PROP_FIELDS[market]))].sort()
  const teams = new Set(lens.teams.map(item => nflMatchupTeam(item.team.abbr)))
  return { rows, explosives, books, markets,
    runGaps: lens.runGaps.filter(row => row.gap !== 'unspecified' && teams.has(nflMatchupTeam(row.team))),
    defense: lens.dvp.filter(row => teams.has(nflMatchupTeam(row.defense))),
  }
}
