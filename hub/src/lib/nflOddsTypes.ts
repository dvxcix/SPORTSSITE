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
  isOpeningOnly?: boolean
}

export type NflPlayerMarket = {
  key: string
  propType: string
  label: string
  category: 'touchdowns' | 'passing' | 'receiving' | 'rushing' | 'kicking' | 'defense' | 'other'
  line: number | null
  offers: NflMarketOffer[]
}

export type NflTdBaseline = {
  propType: 'anytime_td' | 'first_td'
  vendor: string
  averageOdds: number
  averageProbability: number | null
  currentProbability: number | null
  sampleGames: number
  firstSampleDate: string | null
  throughDate: string | null
  /** Probability-point displacement: positive = quieter/hidden, negative = louder/advertised. */
  deltaProbabilityPoints: number | null
  /** Current American price versus average American price, stored as a decimal. */
  deltaPct: number | null
  deltaOdds: number | null
}

export type NflOddsPlayer = {
  id: number
  teamId?: number | null
  name: string
  team: string
  position: string
  gsisId?: string | null
  headshot?: string | null
  headshotFallbacks?: string[]
  jersey?: number | null
  rookieSeason?: number | null
  lastSeason?: number | null
  latestTeam?: string | null
  rosterStatus?: string | null
  markets: NflPlayerMarket[]
  tdBaselines?: NflTdBaseline[]
  publicPicks?: Array<{
    propType: string
    label: string
    rawMarket: string
    picks: number
    capturedAt: string
  }>
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
  isOpeningOnly?: boolean
}

export type SidelineOddsBoard = {
  bdlGameId: number | null
  status: 'ready' | 'not-posted' | 'unavailable'
  capturedAt: string | null
  source: 'live' | 'opening' | 'snapshot' | 'none'
  gameLines: NflGameLineBook[]
  players: NflOddsPlayer[]
  pikkitCapturedAt?: string | null
}

export const EMPTY_SIDELINE_ODDS: SidelineOddsBoard = {
  bdlGameId: null,
  status: 'not-posted',
  capturedAt: null,
  source: 'none',
  gameLines: [],
  players: [],
}
