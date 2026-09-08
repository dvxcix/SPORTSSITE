import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'

export type SidelineTeam = {
  abbr: string
  name: string
  color: string
  color2?: string | null
  logo: string | null
}

export type SidelineGame = {
  id: string
  season: number
  week: number
  gameType: string
  gameday: string
  gametime: string | null
  stadium: string | null
  roof: string | null
  surface: string | null
  temp?: number | null
  wind?: number | null
  away: SidelineTeam
  home: SidelineTeam
}

export type SidelineTeamProfile = {
  team: SidelineTeam
  plays: number
  passRate: number
  neutralPassRate: number
  shotgunRate: number
  noHuddleRate: number
  successRate: number
  explosiveRate: number
  redZoneTdRate: number
  thirdDownRate: number
  defenseSuccessAllowed: number
  defenseExplosiveAllowed: number
}

export type SidelinePlayer = {
  id: string
  name: string
  team: string
  position: string
  headshot: string | null
  headshotFallbacks?: string[]
  jersey: number | null
  rookieSeason?: number | null
  latestTeam?: string | null
  rosterStatus?: string | null
  sampleTeam?: string | null
  games: number
  index: number
  volume: number
  geometry: number
  redZone: number
  breakaway: number
  evidence: number
  targets: number
  receptions: number
  receivingYards: number
  carries: number
  rushingYards: number
  passAttempts: number
  completions: number
  passingYards: number
  touchdowns: number
  targetShare: number
  carryShare: number
  airYards: number
  airYardsShare: number
  separation: number
  yacAboveExpected: number
  rushOverExpected: number
  catchRate: number
  completionRate: number
  cpoe: number
  timeToThrow: number
  redZoneLooks: number
  goalLineLooks: number
  explosivePlays: number
  lane: string
}

export type SidelineWindow = 'season' | 'l1' | 'l3' | 'l5' | 'l10'

export type SidelineWindowData = {
  plays: number
  weeks: number[]
  teams: SidelineTeamProfile[]
  players: SidelinePlayer[]
}

export type SidelineLens = {
  season: number
  status: 'calculated' | 'awaiting-data'
  headline: string
  headlineDetail: string
  aggressor: string
  coverage: {
    sampleSeason: number
    scheduleStart: number
    trackingStart: number
    playByPlayStart: number
    usesPriorSeason: boolean
    label: string
    detail: string
  }
  windows: Record<SidelineWindow, SidelineWindowData>
}

export type SidelineOddsFrame = {
  capturedAt: string
  board: SidelineOddsBoard
}
