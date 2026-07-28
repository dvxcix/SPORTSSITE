const BASE = 'https://statsapi.mlb.com/api/v1'

// ─── URL helpers ─────────────────────────────────────────────────
// "silo" is MLB's transparent-background cutout headshot variant. The "67"
// variant used previously actually serves a JPEG (content-type image/jpeg
// despite the .png in the URL) — JPEGs can't be transparent, which is why
// every headshot showed a gray box behind it instead of a clean cutout.
export function mlbHeadshot(playerId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_426,q_auto:best/v1/people/${playerId}/headshot/silo/current`
}

export function mlbTeamLogo(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

// ─── Types ───────────────────────────────────────────────────────
export interface MLBTeamInfo {
  id: number
  name: string
  abbreviation?: string
  teamName?: string
  franchiseName?: string
  locationName?: string
}

export interface MLBGame {
  gamePk: number
  gameDate: string
  status: {
    abstractGameState: 'Preview' | 'Live' | 'Final'
    detailedState: string
    statusCode: string
    codedGameState: string
    startTimeTBD?: boolean
  }
  teams: {
    away: { team: MLBTeamInfo; score?: number; leagueRecord: { wins: number; losses: number; pct: string } }
    home: { team: MLBTeamInfo; score?: number; leagueRecord: { wins: number; losses: number; pct: string } }
  }
  linescore?: {
    currentInning?: number
    currentInningOrdinal?: string
    inningHalf?: string
    outs?: number
    balls?: number
    strikes?: number
    innings?: { num: number; home: { runs?: number; hits?: number; errors?: number }; away: { runs?: number; hits?: number; errors?: number } }[]
    teams?: { home: { runs: number; hits: number; errors: number }; away: { runs: number; hits: number; errors: number } }
    offense?: { first?: { id: number }; second?: { id: number }; third?: { id: number }; batter?: { id: number; fullName: string } }
  }
  venue?: { id: number; name: string }
  broadcasts?: { name: string; type: string }[]
}

export interface MLBPitch {
  details: {
    type?: { code: string; description: string }
    description: string
    call?: { code: string; description: string }
    isBall: boolean
    isStrike: boolean
    isInPlay: boolean
  }
  pitchData?: {
    startSpeed?: number
    endSpeed?: number
    spinRate?: number
    zone?: number
    strikeZoneTop?: number
    strikeZoneBottom?: number
    coordinates?: { pX?: number; pZ?: number; x0?: number; z0?: number }
    breaks?: { breakAngle?: number; breakLength?: number; spinDirection?: number; breakVertical?: number; breakHorizontal?: number }
  }
  hitData?: {
    launchSpeed?: number
    launchAngle?: number
    totalDistance?: number
    hardness?: string
    location?: string
    trajectory?: string
  }
  index: number
  playId?: string
  pitchNumber?: number
  type: 'pitch' | 'action' | 'no_pitch' | 'pickoff'
}

export interface MLBPlay {
  result: {
    type: string
    event?: string
    eventType?: string
    description?: string
    rbi: number
    awayScore: number
    homeScore: number
    isScoringPlay?: boolean
  }
  about: {
    atBatIndex: number
    halfInning: 'top' | 'bottom'
    isTopInning: boolean
    inning: number
    startTime: string
    endTime?: string
    isComplete: boolean
    isScoringPlay: boolean
    hasReview: boolean
    hasOut: boolean
    captivatingIndex: number
  }
  count: { balls: number; strikes: number; outs: number }
  matchup: {
    batter: { id: number; fullName: string }
    batSide: { code: string; description: string }
    pitcher: { id: number; fullName: string }
    pitchHand: { code: string; description: string }
    postOnFirst?: { id: number; fullName: string }
    postOnSecond?: { id: number; fullName: string }
    postOnThird?: { id: number; fullName: string }
  }
  pitchIndex: number[]
  actionIndex: number[]
  runnerIndex: number[]
  runners?: {
    movement: { originBase?: string; end?: string; outBase?: string; isOut?: boolean; outNumber?: number }
    details: { event: string; runner: { id: number; fullName: string }; earned?: boolean }
  }[]
  playEvents: MLBPitch[]
  atBatIndex?: number
}

export interface MLBBoxPlayer {
  person: { id: number; fullName: string }
  jerseyNumber?: string
  position?: { abbreviation: string; name: string; code?: string; type?: string }
  status?: { code: string; description: string }
  battingOrder?: string
  stats: {
    batting?: {
      atBats?: number; hits?: number; homeRuns?: number; rbi?: number
      baseOnBalls?: number; strikeOuts?: number; avg?: string; ops?: string
      runs?: number; stolenBases?: number; doubles?: number; triples?: number; leftOnBase?: number
    }
    pitching?: {
      inningsPitched?: string; earnedRuns?: number; strikeOuts?: number; baseOnBalls?: number
      hits?: number; homeRuns?: number; pitchesThrown?: number; strikes?: number; era?: string; runs?: number
    }
    fielding?: Record<string, number>
  }
  seasonStats?: {
    batting?: { avg?: string; ops?: string; homeRuns?: number; rbi?: number; obp?: string; slg?: string }
    pitching?: { era?: string; wins?: number; losses?: number; strikeOuts?: number; whip?: string; inningsPitched?: string }
  }
  gameStatus?: { isCurrentBatter?: boolean; isCurrentPitcher?: boolean; isOnBench?: boolean; isSubstitute?: boolean }
}

export interface MLBBoxTeam {
  team: MLBTeamInfo & { id: number }
  teamStats: {
    batting: Record<string, string | number>
    pitching: Record<string, string | number>
    fielding: Record<string, string | number>
  }
  players: Record<string, MLBBoxPlayer>
  batters?: number[]
  pitchers?: number[]
  bench?: number[]
  bullpen?: number[]
  battingOrder?: number[]
  info?: { title: string; fieldList: { label: string; value: string }[] }[]
}

export interface MLBGameFeed {
  gamePk: number
  gameData: {
    game: { pk: number; season: string; type: string }
    datetime: { dateTime: string; officialDate: string; dayNight: string; time?: string; ampm?: string }
    status: { abstractGameState: string; detailedState: string; statusCode: string; startTimeTBD?: boolean }
    teams: {
      away: MLBTeamInfo & { record?: { wins: number; losses: number } }
      home: MLBTeamInfo & { record?: { wins: number; losses: number } }
    }
    players: Record<string, {
      id: number; fullName: string; firstName: string; lastName: string
      primaryNumber?: string
      primaryPosition?: { abbreviation: string; name: string; code?: string; type?: string }
      batSide?: { code: string }; pitchHand?: { code: string }
      currentAge?: number; height?: string; weight?: number
    }>
    venue: { id: number; name: string; location?: { city?: string; state?: string } }
    weather?: { condition: string; temp: string; wind: string }
    probablePitchers?: { home?: { id: number; fullName: string }; away?: { id: number; fullName: string } }
  }
  liveData: {
    plays: {
      allPlays: MLBPlay[]
      currentPlay?: MLBPlay
      scoringPlays?: number[]
      playsByInning?: { startIndex: number; endIndex: number; top: number[]; bottom: number[] }[]
    }
    linescore: {
      currentInning?: number
      currentInningOrdinal?: string
      inningHalf?: string
      scheduledInnings?: number
      outs?: number; balls?: number; strikes?: number
      note?: string
      innings: {
        num: number; ordinalNum: string
        home: { runs?: number; hits?: number; errors?: number; leftOnBase?: number }
        away: { runs?: number; hits?: number; errors?: number; leftOnBase?: number }
      }[]
      teams: { home: { runs: number; hits: number; errors: number; leftOnBase: number }; away: { runs: number; hits: number; errors: number; leftOnBase: number } }
      offense?: {
        batter?: { id: number; fullName: string }
        onDeck?: { id: number; fullName: string }
        inHole?: { id: number; fullName: string }
        pitcher?: { id: number; fullName: string }
        first?: { id: number }; second?: { id: number }; third?: { id: number }
      }
      defense?: { pitcher?: { id: number; fullName: string }; catcher?: { id: number }; team?: { id: number } }
    }
    boxscore: {
      teams: { home: MLBBoxTeam; away: MLBBoxTeam }
      officials?: { official: { id: number; fullName: string }; officialType: string }[]
      info?: { label?: string; value?: string }[]
    }
    decisions?: {
      winner?: { id: number; fullName: string }
      loser?: { id: number; fullName: string }
      save?: { id: number; fullName: string }
    }
  }
}

// ─── API calls ───────────────────────────────────────────────────
export async function getMLBSchedule(date?: string): Promise<MLBGame[]> {
  try {
    const d = date ?? new Date().toISOString().split('T')[0]
    const url = `${BASE}/schedule?sportId=1&date=${d}&hydrate=linescore,team,broadcasts(all),venue`
    const res = await fetch(url, { next: { revalidate: 30 }, headers: { 'User-Agent': 'SlipSurge/1.0' } })
    if (!res.ok) return []
    const data = await res.json()
    return data.dates?.[0]?.games ?? []
  } catch {
    return []
  }
}

export async function getMLBGameFeed(gamePk: number | string): Promise<MLBGameFeed | null> {
  try {
    const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
    const res = await fetch(url, { next: { revalidate: 15 }, headers: { 'User-Agent': 'SlipSurge/1.0' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Keep backwards compat for existing /mlb route
export async function getTodaysGames(): Promise<MLBGame[]> {
  return getMLBSchedule()
}

// ─── Helpers ─────────────────────────────────────────────────────
export function mlbGameIsLive(game: MLBGame): boolean {
  return game.status.abstractGameState === 'Live'
}

export function mlbGameIsFinal(game: MLBGame): boolean {
  return game.status.abstractGameState === 'Final'
}

export function mlbGameLabel(game: MLBGame): string {
  const s = game.status.abstractGameState
  if (s === 'Final') return 'Final'
  if (s === 'Live') {
    const ls = game.linescore
    if (ls?.currentInningOrdinal) {
      const half = ls.inningHalf === 'Bottom' ? 'Bot' : 'Top'
      return `${half} ${ls.currentInningOrdinal}${ls.outs !== undefined ? ` · ${ls.outs} out${ls.outs !== 1 ? 's' : ''}` : ''}`
    }
    return 'Live'
  }
  if (game.status.startTimeTBD) return 'TBD'
  try {
    // No explicit timeZone — only ever called from 'use client' components
    // (MLBGameCard, MLBScoreRow), so this already renders in whatever
    // timezone the visitor's own browser/OS is set to. Do not call this
    // from a server component or reintroduce a hardcoded zone here.
    const d = new Date(game.gameDate)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return game.status.detailedState
  }
}

// Pitch type palette
export const PITCH_COLORS: Record<string, string> = {
  FF: '#E74C3C', FA: '#E74C3C',
  SI: '#E67E22',
  FC: '#E91E8C',
  FS: '#F1C40F', FO: '#F1C40F',
  CH: '#9B59B6', SC: '#9B59B6',
  SL: '#3498DB', ST: '#3498DB', SV: '#3498DB',
  CU: '#27AE60', KC: '#16A085',
  KN: '#BDC3C7', EP: '#BDC3C7',
  PO: '#95A5A6', AB: '#95A5A6', IN: '#95A5A6', NP: '#95A5A6',
}

export function pitchColor(code: string): string {
  return PITCH_COLORS[code?.toUpperCase()] ?? '#95A5A6'
}

export function pitchLabel(code: string): string {
  const labels: Record<string, string> = {
    FF: '4-Seam', FA: '4-Seam', SI: 'Sinker', FC: 'Cutter', FS: 'Splitter',
    FO: 'Forkball', CH: 'Changeup', SC: 'Screwball', SL: 'Slider',
    ST: 'Sweeper', SV: 'Slurve', CU: 'Curveball', KC: 'Knuckle Curve',
    KN: 'Knuckleball', EP: 'Eephus', PO: 'Pitch Out',
    AB: 'Auto Ball', IN: 'Intent Ball', NP: 'No Pitch',
  }
  return labels[code?.toUpperCase()] ?? code ?? ''
}

// Outcome-based color for pitch-sequence dots (realsports.io-style):
// ball = green, strike (including foul) = red, in-play = blue.
export function pitchOutcomeColor(pitch: { details: { isBall: boolean; isStrike: boolean; isInPlay: boolean } }): string {
  if (pitch.details.isInPlay) return '#3B82F6'
  if (pitch.details.isStrike) return '#EF4444'
  if (pitch.details.isBall) return '#22C55E'
  return '#95A5A6'
}

export function pitchOutcomeLabel(pitch: { details: { isBall: boolean; isStrike: boolean; isInPlay: boolean; call?: { description: string } } }): string {
  if (pitch.details.isInPlay) return pitch.details.call?.description ?? 'In Play'
  if (pitch.details.isStrike) return pitch.details.call?.description ?? 'Strike'
  if (pitch.details.isBall) return 'Ball'
  return pitch.details.call?.description ?? ''
}
