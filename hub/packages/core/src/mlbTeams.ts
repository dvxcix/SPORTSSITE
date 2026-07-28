import { MLB_TEAM_IDS } from './mlbTeamColors'

export type MlbTeam = { id: number; abbr: string; name: string; shortName: string }

// Full names for every MLB franchise, keyed by the same abbreviations
// MLB_TEAM_IDS already uses — kept here rather than in mlbTeamColors.ts
// since this is search-specific (matching "Yankees" or "New York Yankees"
// as search text), not styling.
const FULL_NAMES: Record<string, { name: string; shortName: string }> = {
  ARI: { name: 'Arizona Diamondbacks', shortName: 'Diamondbacks' },
  ATL: { name: 'Atlanta Braves', shortName: 'Braves' },
  BAL: { name: 'Baltimore Orioles', shortName: 'Orioles' },
  BOS: { name: 'Boston Red Sox', shortName: 'Red Sox' },
  CHC: { name: 'Chicago Cubs', shortName: 'Cubs' },
  CWS: { name: 'Chicago White Sox', shortName: 'White Sox' },
  CIN: { name: 'Cincinnati Reds', shortName: 'Reds' },
  CLE: { name: 'Cleveland Guardians', shortName: 'Guardians' },
  COL: { name: 'Colorado Rockies', shortName: 'Rockies' },
  DET: { name: 'Detroit Tigers', shortName: 'Tigers' },
  HOU: { name: 'Houston Astros', shortName: 'Astros' },
  KC: { name: 'Kansas City Royals', shortName: 'Royals' },
  LAA: { name: 'Los Angeles Angels', shortName: 'Angels' },
  LAD: { name: 'Los Angeles Dodgers', shortName: 'Dodgers' },
  MIA: { name: 'Miami Marlins', shortName: 'Marlins' },
  MIL: { name: 'Milwaukee Brewers', shortName: 'Brewers' },
  MIN: { name: 'Minnesota Twins', shortName: 'Twins' },
  NYM: { name: 'New York Mets', shortName: 'Mets' },
  NYY: { name: 'New York Yankees', shortName: 'Yankees' },
  ATH: { name: 'Athletics', shortName: 'Athletics' },
  PHI: { name: 'Philadelphia Phillies', shortName: 'Phillies' },
  PIT: { name: 'Pittsburgh Pirates', shortName: 'Pirates' },
  SD: { name: 'San Diego Padres', shortName: 'Padres' },
  SF: { name: 'San Francisco Giants', shortName: 'Giants' },
  SEA: { name: 'Seattle Mariners', shortName: 'Mariners' },
  STL: { name: 'St. Louis Cardinals', shortName: 'Cardinals' },
  TB: { name: 'Tampa Bay Rays', shortName: 'Rays' },
  TEX: { name: 'Texas Rangers', shortName: 'Rangers' },
  TOR: { name: 'Toronto Blue Jays', shortName: 'Blue Jays' },
  WSH: { name: 'Washington Nationals', shortName: 'Nationals' },
}

// Excludes the AZ/OAK duplicate abbreviation aliases already in
// MLB_TEAM_IDS (AZ==ARI, OAK==ATH) — one canonical row per real team.
export const MLB_TEAMS: MlbTeam[] = Object.entries(FULL_NAMES).map(([abbr, { name, shortName }]) => ({
  id: MLB_TEAM_IDS[abbr], abbr, name, shortName,
}))

const idToAbbr = new Map(Object.entries(MLB_TEAM_IDS).map(([abbr, id]) => [id, abbr]))
export function mlbTeamAbbrById(id: number | undefined | null): string | undefined {
  if (id == null) return undefined
  return idToAbbr.get(id)
}

export function searchMlbTeams(query: string): MlbTeam[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return MLB_TEAMS.filter(t =>
    t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q) || t.abbr.toLowerCase() === q
  )
}
