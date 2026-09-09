import type { NflOddsPlayer, NflTdBaseline, SidelineOddsBoard } from './nflOddsTypes'
import { americanImpliedProbability, hiddenProbabilityPoints, nflPriceChange } from './nflMarketMath'
import { nflPrimaryMarket } from './nflPrimaryMarket'

const BOOK_ORDER = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics', 'betrivers', 'kalshi', 'polymarket']

export type NflTdBaselineRow = {
  slate_date: string
  player_id: number
  player_name: string
  team_abbr: string | null
  vendor: string
  prop_type: 'anytime_td' | 'first_td'
  average_odds: number | string
  average_implied_probability?: number | string | null
  sample_games: number
  first_sample_date: string | null
  through_date: string | null
}

function bookRank(vendor: string) {
  const rank = BOOK_ORDER.indexOf(vendor)
  return rank < 0 ? BOOK_ORDER.length : rank
}

function milestoneOdds(player: NflOddsPlayer, propType: string, vendor: string) {
  const market = nflPrimaryMarket(player, propType, vendor)
  const offer = market?.offers.find(candidate => candidate.vendor === vendor)
  return offer?.current.odds ?? offer?.current.over ?? null
}

export function attachNflTdBaselines(board: SidelineOddsBoard, rows: NflTdBaselineRow[]): SidelineOddsBoard {
  if (!rows.length) return board
  const byPlayer = new Map<number, NflTdBaselineRow[]>()
  rows.forEach(row => byPlayer.set(row.player_id, [...(byPlayer.get(row.player_id) ?? []), row]))
  return {
    ...board,
    players: board.players.map(player => {
      const baselines: NflTdBaseline[] = (byPlayer.get(player.id) ?? []).map(row => {
        const averageOdds = Number(row.average_odds)
        const current = milestoneOdds(player, row.prop_type, row.vendor)
        const averageProbability = row.average_implied_probability == null
          ? americanImpliedProbability(averageOdds)
          : Number(row.average_implied_probability)
        const currentProbability = americanImpliedProbability(current)
        const deltaProbabilityPoints = hiddenProbabilityPoints(averageProbability, currentProbability)
          const deltaPct = deltaProbabilityPoints == null ? null : nflPriceChange(current, averageOdds)
        return {
          propType: row.prop_type,
          vendor: row.vendor,
          averageOdds,
          averageProbability: Number.isFinite(averageProbability) ? averageProbability : null,
          currentProbability,
          sampleGames: row.sample_games,
          firstSampleDate: row.first_sample_date,
          throughDate: row.through_date,
          deltaProbabilityPoints,
            // Profit-price movement versus the player's own reference; avoids
            // a spurious 200% move at the +100 / -100 notation boundary.
          deltaPct,
          deltaOdds: current == null || !Number.isFinite(averageOdds) ? null : current - averageOdds,
        }
      })
      return baselines.length ? { ...player, tdBaselines: baselines } : player
    }),
  }
}

export function mergeNflOddsBoards(previous: SidelineOddsBoard | null, fresh: SidelineOddsBoard): SidelineOddsBoard {
  if (!previous || previous.status !== 'ready') return fresh
  if (fresh.status !== 'ready') return { ...previous, capturedAt: fresh.capturedAt ?? previous.capturedAt }

  const playerMap = new Map(previous.players.map(player => [player.id, player]))
  for (const player of fresh.players) {
    const prior = playerMap.get(player.id)
    if (!prior) {
      playerMap.set(player.id, player)
      continue
    }
    const marketMap = new Map(prior.markets.map(market => [market.key, market]))
    for (const market of player.markets) {
      const priorMarket = marketMap.get(market.key)
      if (!priorMarket) {
        marketMap.set(market.key, market)
        continue
      }
      const offers = new Map(priorMarket.offers.map(offer => [offer.vendor, offer]))
      market.offers.forEach(offer => {
        if (offer.isOpeningOnly && offers.has(offer.vendor)) return
        offers.set(offer.vendor, offer)
      })
      marketMap.set(market.key, {
        ...priorMarket,
        ...market,
        offers: Array.from(offers.values()).sort((a, b) => bookRank(a.vendor) - bookRank(b.vendor)),
      })
    }
    playerMap.set(player.id, {
      ...prior,
      ...player,
      markets: Array.from(marketMap.values()),
      tdBaselines: prior.tdBaselines,
    })
  }

  const lineMap = new Map(previous.gameLines.map(line => [line.vendor, line]))
  fresh.gameLines.forEach(line => {
    if (line.isOpeningOnly && lineMap.has(line.vendor)) return
    lineMap.set(line.vendor, line)
  })
  return {
    ...fresh,
    status: 'ready',
    gameLines: Array.from(lineMap.values()).sort((a, b) => bookRank(a.vendor) - bookRank(b.vendor)),
    players: Array.from(playerMap.values()).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name)),
  }
}

export function nflOddsPayloadHash(board: SidelineOddsBoard) {
  const stable = JSON.stringify({
    gameLines: board.gameLines,
    players: board.players.map(player => ({
      id: player.id,
      name: player.name,
      team: player.team,
      position: player.position,
      markets: player.markets,
    })),
  })
  let hash = 2166136261
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
