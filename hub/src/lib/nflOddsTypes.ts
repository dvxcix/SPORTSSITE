export type NflOddsValue = {
  odds?: number
  over?: number
  under?: number
}

export type NflMarketOffer = {
  vendor: string
  line: number | null
  openingLine: number | null
  type: 'milestone' | 'over_under'
  current: NflOddsValue
  opening: NflOddsValue | null
  updatedAt: string | null
}

export type NflPlayerMarket = {
  key: string
  propType: string
  label: string
  category: 'touchdowns' | 'passing' | 'receiving' | 'rushing' | 'kicking' | 'defense' | 'other'
  line: number | null
  offers: NflMarketOffer[]
}

export type NflOddsPlayer = {
  id: number
  name: string
  team: string
  position: string
  markets: NflPlayerMarket[]
}

export type NflGameLineBook = {
  vendor: string
  spreadHome: number | null
  spreadHomeOdds: number | null
  spreadAway: number | null
  spreadAwayOdds: number | null
  moneylineHome: number | null
  moneylineAway: number | null
  total: number | null
  totalOverOdds: number | null
  totalUnderOdds: number | null
  opening: Omit<NflGameLineBook, 'vendor' | 'opening' | 'updatedAt'> | null
  updatedAt: string | null
}

export type SidelineOddsBoard = {
  bdlGameId: number | null
  status: 'ready' | 'not-posted' | 'unavailable'
  capturedAt: string | null
  source: 'live' | 'snapshot' | 'none'
  gameLines: NflGameLineBook[]
  players: NflOddsPlayer[]
}

export const EMPTY_SIDELINE_ODDS: SidelineOddsBoard = {
  bdlGameId: null,
  status: 'not-posted',
  capturedAt: null,
  source: 'none',
  gameLines: [],
  players: [],
}
