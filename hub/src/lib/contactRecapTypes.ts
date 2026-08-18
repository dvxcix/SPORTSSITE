export type ContactKind = 'home_run' | 'near_hr' | 'hit' | 'out' | 'other'
export type CoordinateSource = 'statcast' | 'mlb_live' | 'bearing_projection'

export type ContactMarketQuote = {
  marketKey: string
  marketLabel: string
  book: string
  bookLabel: string
  odds: number
}

export type ContactMarketContext = {
  primaryLabel: string
  primary: ContactMarketQuote[]
  specials: ContactMarketQuote[]
  frozenAt: string | null
}

export type DailyContactGame = {
  gamePk: number
  gameIndex: number
  gameDate: string
  startTime: string
  status: string
  venueId: number | null
  venueName: string
  parkTeamAbbr: string
  homeTeamId: number
  homeTeam: string
  homeName: string
  homeScore: number | null
  awayTeamId: number
  awayTeam: string
  awayName: string
  awayScore: number | null
}

export type DailyContactEvent = {
  id: string
  kind: ContactKind
  gamePk: number
  gameIndex: number
  gameDate: string
  eventTime: string | null
  atBatIndex: number
  pitchNumber: number
  batterId: number
  batterName: string
  batterTeam: string
  pitcherId: number | null
  pitcherName: string
  pitcherTeam: string
  inning: number | null
  half: string
  result: string
  description: string
  rbi: number
  isFirstHr: boolean
  isGrandSlam: boolean
  exitVelocity: number | null
  launchAngle: number | null
  distance: number | null
  hitBearing: number | null
  hcX: number
  hcY: number
  coordinateSource: CoordinateSource
  pitchType: string | null
  pitchSpeed: number | null
  bbType: string | null
  parksHrCount: number | null
  parkHrList: string | null
  game: DailyContactGame
  marketContext?: ContactMarketContext
}

export type DailyContactSlate = {
  date: string
  generatedAt: string
  games: DailyContactGame[]
  contacts: DailyContactEvent[]
  homeRuns: DailyContactEvent[]
  nearHomeRuns: DailyContactEvent[]
  dataNotes: string[]
}
