import type { SidelineGame, SidelineLens, SidelinePlayer, SidelineWindow } from '@/app/the-sideline/types'
import { nflAvailability, nflHasCurrentMarket, nflMarketExclusion, nflMarketPlayerKey } from './nflAvailability'
import { americanImpliedProbability, impliedProbabilityRatio } from './nflMarketMath'
import { nflMatchupTeam } from './nflMatchupBoard'
import type { NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'
import { normalizeNflPlayerName } from './nflPlayerName'
import { nflPrimaryMarket } from './nflPrimaryMarket'
import type { nativeNflMismatch } from './nativeNflResearch'

const metricKeys = [
  'index', 'volume', 'geometry', 'redZone', 'breakaway', 'evidence', 'targets', 'receptions', 'receivingYards',
  'carries', 'rushingYards', 'passAttempts', 'completions', 'passingYards', 'passingTouchdowns', 'touchdowns',
  'targetShare', 'carryShare', 'airYards', 'totalAirYards', 'airYardsShare', 'separation', 'yacAboveExpected',
  'rushOverExpected', 'catchRate', 'completionRate', 'cpoe', 'timeToThrow', 'redZoneLooks', 'redZoneTargets',
  'redZoneCarries', 'redZoneTargetShare', 'redZoneCarryShare', 'goalLineLooks', 'explosivePlays',
] as const satisfies readonly (keyof SidelinePlayer)[]

const playerKey = (team: string, name: string) => `${nflMatchupTeam(team)}:${normalizeNflPlayerName(name)}`

function stats(player: SidelinePlayer | undefined) {
  const result: Record<string, number> = {}
  if (!player) return result
  const missing = new Set(player.unavailableMetrics)
  if (player.targets <= 0) missing.add('catchRate')
  if (player.passAttempts <= 0) missing.add('completionRate')
  for (const field of metricKeys) {
    const value = player[field]
    if (!missing.has(field) && typeof value === 'number' && Number.isFinite(value)) result[field] = value
  }
  for (const [field, value] of Object.entries(player.dvp ?? {})) {
    if (Number.isFinite(value)) result['dvp:' + field] = value
  }
  const present = (keys: string[], metric: string) => {
    if (keys.every(key => result[key] != null)) result[metric] = keys.reduce((sum, key) => sum + result[key], 0)
  }
  if (!missing.has('roleOpps')) {
    if (player.position === 'QB') present(['passAttempts'], 'roleOpps')
    else if (['RB', 'FB'].includes(player.position)) present(['carries', 'targets'], 'roleOpps')
    else if (['WR', 'TE'].includes(player.position)) present(['targets'], 'roleOpps')
    else if (Number.isFinite(player.games)) result.roleOpps = player.games
  }
  if (!missing.has('roleShare')) present([player.position === 'QB' ? 'completionRate' :
    ['RB', 'FB'].includes(player.position) ? 'carryShare' : ['WR', 'TE'].includes(player.position) ? 'targetShare' : 'evidence'], 'roleShare')
  if (!missing.has('roleYards')) present(player.position === 'QB' ? ['passingYards'] :
    ['RB', 'FB'].includes(player.position) ? ['rushingYards', 'receivingYards'] :
      ['WR', 'TE'].includes(player.position) ? ['receivingYards'] : ['explosivePlays'], 'roleYards')
  return result
}

function signal(player: NflOddsPlayer, vendor: string, moneyline: number | null) {
  const quote = (type: string) => {
    const market = nflPrimaryMarket(player, type, vendor)
    const offer = market?.offers.find(item => item.vendor === vendor && !item.isOpeningOnly)
    const price = offer?.current.odds ?? offer?.current.over ?? null
    if (!offer || americanImpliedProbability(price) == null) return null
    return {
      line: offer.line ?? market?.line ?? null, price,
      opening: offer.opening?.odds ?? offer.opening?.over ?? null, observedAt: offer.updatedAt,
    }
  }
  const pickCount = (prop: string) => {
    const counts = (player.publicPicks ?? []).filter(pick => pick.propType === prop).map(pick => pick.picks)
    return counts.length ? Math.max(...counts) : null
  }
  const first = quote('first_td'), anytime = quote('anytime_td')
  const baseline = player.tdBaselines?.find(row => row.propType === 'anytime_td' && row.vendor === vendor)
  const roleMarket = player.position === 'QB' ? 'passing_yards' :
    ['RB', 'FB'].includes(player.position) ? 'rushing_yards' : 'receiving_yards'
  const role = quote(roleMarket)
  return { first, anytime, role, roleMarket, firstPicks: pickCount('first_td'), anytimePicks: pickCount('anytime_td'),
    ratio: impliedProbabilityRatio(first?.price ?? null, anytime?.price ?? null),
    moneylineRatio: impliedProbabilityRatio(anytime?.price ?? null, moneyline),
    roleRatio: impliedProbabilityRatio(anytime?.price ?? null, role?.price ?? null),
    baselineMove: baseline?.deltaProbabilityPoints ?? null, baselineGames: baseline?.sampleGames ?? null }
}

export function nativeNflBoard(game: SidelineGame, lens: SidelineLens, windowId: SidelineWindow,
  board: SidelineOddsBoard, ranks: ReturnType<typeof nativeNflMismatch>['rows'], vendor: string, matchup: boolean,
) {
  const window = lens.windows[windowId]
  const teams = new Set([game.away.abbr, game.home.abbr].map(nflMatchupTeam))
  const markets = [...new Map([...(board.availabilityPlayers ?? []), ...board.players]
    .filter(player => teams.has(nflMatchupTeam(player.team))).map(player => [nflMarketPlayerKey(player), player])).values()]
  const historicalById = new Map(window.players.map(player => [player.id, player]))
  const sameTeamByName = Map.groupBy(window.players, player => playerKey(player.team, player.name))
  const scoreById = new Map(ranks.map(rank => [rank.player.id, rank]))
  const activeIds = new Set(board.players.map(nflMarketPlayerKey))
  const bookLines = board.gameLines.find(line => line.vendor === vendor)
  const rows = markets.flatMap(player => {
    const club = nflMatchupTeam(player.team)
    const identity = player.gsisId ? historicalById.get(player.gsisId) : undefined
    const names = sameTeamByName.get(playerKey(player.team, player.name))
    const historical = identity && nflMatchupTeam(identity.team) === club ? identity :
      !player.gsisId && names?.length === 1 ? names[0] : undefined
    const active = activeIds.has(nflMarketPlayerKey(player)) && !nflMarketExclusion(player, lens.season) && nflHasCurrentMarket(player)
    if (matchup && (!historical || !active)) return []
    const status = nflAvailability({ availability: player.availability, rosterStatus: player.rosterStatus }, game.gameday)
    const rank = scoreById.get(player.id)
    const moneyline = (club === nflMatchupTeam(game.home.abbr) ? bookLines?.moneylineHome : bookLines?.moneylineAway) ?? null
    return [{ player: { id: player.id, gsisId: player.gsisId ?? null, name: player.name, team: player.team, position: player.position,
      headshot: player.headshot ?? historical?.headshot ?? null, headshotFallbacks: player.headshotFallbacks ?? historical?.headshotFallbacks ?? [] },
    games: historical?.games ?? null, lane: historical?.lane ?? null, status: status.label ?? rank?.status ?? null,
    score: rank?.score ?? null, mm: rank?.mm ?? null, metrics: stats(historical),
    signal: board.availabilityStale || !status.eligible || !active ? null : signal(player, vendor, moneyline) }]
  })
  const profiles = window.teams.filter(profile => teams.has(nflMatchupTeam(profile.team.abbr))).map(({ team, ...profile }) => ({
    code: team.abbr, name: team.name, plays: profile.plays,
    metrics: Object.fromEntries(Object.entries(profile).filter(([key, value]) => key !== 'plays' && Number.isFinite(value))),
  }))
  const books = [...new Set(board.players.flatMap(player => player.markets.flatMap(market => market.offers.map(offer => offer.vendor))))].sort()
  return { rows, profiles, books, sampleWeeks: window.weeks, headline: lens.headline, headlineDetail: lens.headlineDetail }
}
