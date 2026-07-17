const BASE = 'https://site.api.espn.com/apis/site/v2/sports'

export interface ESPNGame {
  id: string
  uid: string
  date: string
  name: string
  shortName: string
  status: {
    clock: number
    displayClock: string
    period: number
    type: { id: string; name: string; state: string; completed: boolean; description: string; detail: string; shortDetail: string }
  }
  competitions: {
    id: string
    competitors: {
      id: string
      uid: string
      type: string
      order: number
      homeAway: 'home' | 'away'
      team: { id: string; uid: string; location: string; name: string; abbreviation: string; displayName: string; shortDisplayName: string; color: string; alternateColor: string; logo: string }
      score: string
      records?: { name: string; summary: string }[]
      leaders?: { name: string; displayValue: string; leaders: { displayValue: string; athlete: { displayName: string } }[] }[]
    }[]
    odds?: { details: string; overUnder: number; spread: number; overOdds: number; underOdds: number }[]
    broadcasts?: { market: { type: string }; names: string[] }[]
    venue?: { fullName: string; address: { city: string; state: string } }
    situation?: { lastPlay?: { text: string }; down?: number; yardLine?: number; distance?: number; isRedZone?: boolean }
  }[]
  links?: { href: string; text: string }[]
}

export interface ESPNPlay {
  id: string
  sequenceNumber: string
  type: { id: string; text: string }
  text: string
  awayScore: number
  homeScore: number
  scoringPlay: boolean
  scoreValue?: number
  period: { number: number; displayValue: string }
  clock: { displayValue: string }
  team?: { id: string }
  start?: { yardLine?: number; distance?: number; down?: number; downDistanceText?: string; isRedZone?: boolean }
  athletes?: {
    athlete: {
      id: string
      displayName: string
      shortName?: string
      headshot?: { href: string }
      position?: { abbreviation?: string }
      jersey?: string
    }
    statistics?: { name: string; displayValue: string }[]
  }[]
  pitchCount?: { pitches: number; strikes: number }
  outs?: number
  battingOrder?: number
}

export interface ESPNSummary {
  header: {
    id: string
    competitions: {
      competitors: {
        homeAway: string
        team: { displayName: string; logo: string; color: string; alternateColor: string; abbreviation: string }
        score: string
        records?: { summary: string }[]
        leaders?: { leaders: { displayValue: string; athlete: { displayName: string; headshot?: { href: string } } }[] }[]
        statistics?: { name: string; displayValue: string; label: string }[]
      }[]
      status: {
        clock: number
        displayClock: string
        period: number
        type: { state: string; shortDetail: string; completed: boolean }
      }
      odds?: { details: string; overUnder: number }[]
      venue?: { fullName: string; address?: { city?: string; state?: string } }
      broadcasts?: { names: string[] }[]
    }[]
  }
  boxscore?: {
    teams?: {
      team: { id: string; displayName: string; abbreviation: string; logo: string }
      statistics: { name: string; displayValue: string; label: string }[]
    }[]
    players?: {
      team: { displayName: string; abbreviation: string }
      statistics: {
        name: string
        keys: string[]
        labels: string[]
        athletes: {
          athlete: { displayName: string; position?: { abbreviation?: string }; headshot?: { href: string } }
          stats: string[]
        }[]
      }[]
    }[]
  }
  leaders?: {
    team: { id: string; displayName: string; logo: string; abbreviation: string }
    leaders: {
      name: string
      displayName: string
      leaders: {
        displayValue: string
        value: number
        athlete: { displayName: string; shortName: string; headshot?: { href: string }; position?: { abbreviation?: string } }
        team: { id: string }
      }[]
    }[]
  }[]
  plays?: ESPNPlay[]
  winprobability?: { tiePercentage: number; homeWinPercentage: number; awayWinPercentage: number; play?: { id: string } }[]
}

export type SportKey = 'nfl' | 'nba' | 'mlb' | 'nhl' | 'soccer'

const SPORT_PATHS: Record<SportKey, string> = {
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
  soccer: 'soccer/usa.1',
}

export async function getScoreboard(sport: SportKey, date?: string): Promise<ESPNGame[]> {
  try {
    // ESPN format: dates=YYYYMMDD
    const dateParam = date ? `?dates=${date.replace(/-/g, '')}` : ''
    const res = await fetch(`${BASE}/${SPORT_PATHS[sport]}/scoreboard${dateParam}`, {
      next: { revalidate: 30 },
      headers: { 'User-Agent': 'SlipSurge/1.0' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.events ?? []
  } catch {
    return []
  }
}

export async function getGameSummary(sport: SportKey, gameId: string): Promise<ESPNSummary | null> {
  try {
    const res = await fetch(`${BASE}/${SPORT_PATHS[sport]}/summary?event=${gameId}`, {
      next: { revalidate: 20 },
      headers: { 'User-Agent': 'SlipSurge/1.0' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getAllScoreboards(): Promise<Record<SportKey, ESPNGame[]>> {
  const sports: SportKey[] = ['nfl', 'nba', 'mlb', 'nhl', 'soccer']
  const results = await Promise.allSettled(sports.map(s => getScoreboard(s)))
  return Object.fromEntries(
    sports.map((s, i) => [s, results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<ESPNGame[]>).value : []])
  ) as Record<SportKey, ESPNGame[]>
}

// Only ever called from 'use client' components (see GameCard.tsx,
// MLBScoreRow.tsx) — no explicit timeZone means toLocaleTimeString already
// renders in whatever timezone the visitor's own browser/OS is set to,
// which is what every viewer should see a game's start time in, not a
// hardcoded Eastern label. Do not call this from a server component: the
// server has no idea what timezone the visitor is in, so the same call
// there would render in the SERVER's timezone instead (see the comment on
// sports/[sport]/[gameId]/page.tsx, which used to do exactly that).
export function getGameStatus(game: ESPNGame): { state: 'pre' | 'in' | 'post'; label: string; isLive: boolean } {
  const state = game.status.type.state
  if (state === 'in') return { state: 'in', label: game.status.type.shortDetail || 'LIVE', isLive: true }
  if (state === 'post') return { state: 'post', label: 'Final', isLive: false }
  const date = new Date(game.date)
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return { state: 'pre', label: timeStr, isLive: false }
}

export function getTeams(game: ESPNGame) {
  const comps = game.competitions?.[0]?.competitors ?? []
  const away = comps.find(c => c.homeAway === 'away')
  const home = comps.find(c => c.homeAway === 'home')
  return { away, home }
}
