import { getTeamColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { nbaTeamLogo } from './nbaPaint'
import { nbaTeamGradient } from './nbaTeamColors'

// Local copy of the existing NFL team directory: no per-avatar database reads.
// League identity is mandatory; BAL must never resolve through MLB by default.
const NFL: Record<string, readonly [string, string, string]> = {
  ARI: ['Arizona Cardinals', '#97233F', '#000000'], ATL: ['Atlanta Falcons', '#A71930', '#000000'],
  BAL: ['Baltimore Ravens', '#241773', '#9E7C0C'], BUF: ['Buffalo Bills', '#00338D', '#C60C30'],
  CAR: ['Carolina Panthers', '#0085CA', '#000000'], CHI: ['Chicago Bears', '#0B162A', '#E64100'],
  CIN: ['Cincinnati Bengals', '#FB4F14', '#000000'], CLE: ['Cleveland Browns', '#FF3C00', '#311D00'],
  DAL: ['Dallas Cowboys', '#002244', '#B0B7BC'], DEN: ['Denver Broncos', '#002244', '#FB4F14'],
  DET: ['Detroit Lions', '#0076B6', '#B0B7BC'], GB: ['Green Bay Packers', '#203731', '#FFB612'],
  HOU: ['Houston Texans', '#03202F', '#A71930'], IND: ['Indianapolis Colts', '#002C5F', '#A5ACAF'],
  JAX: ['Jacksonville Jaguars', '#006778', '#000000'], KC: ['Kansas City Chiefs', '#E31837', '#FFB612'],
  LAC: ['Los Angeles Chargers', '#007BC7', '#FFC20E'], LAR: ['Los Angeles Rams', '#003594', '#FFD100'],
  LV: ['Las Vegas Raiders', '#000000', '#A5ACAF'], MIA: ['Miami Dolphins', '#008E97', '#F58220'],
  MIN: ['Minnesota Vikings', '#4F2683', '#FFC62F'], NE: ['New England Patriots', '#002244', '#C60C30'],
  NO: ['New Orleans Saints', '#D3BC8D', '#000000'], NYG: ['New York Giants', '#0B2265', '#A71930'],
  NYJ: ['New York Jets', '#003F2D', '#000000'], PHI: ['Philadelphia Eagles', '#004C54', '#A5ACAF'],
  PIT: ['Pittsburgh Steelers', '#000000', '#FFB612'], SEA: ['Seattle Seahawks', '#002244', '#69BE28'],
  SF: ['San Francisco 49ers', '#AA0000', '#B3995D'], TB: ['Tampa Bay Buccaneers', '#A71930', '#322F2B'],
  TEN: ['Tennessee Titans', '#4495D2', '#D50A0A'], WAS: ['Washington Commanders', '#5A1414', '#FFB612'],
}
const NFL_ALIASES: Record<string, string> = { JAC: 'JAX', WSH: 'WAS', LA: 'LAR', STL: 'LAR', OAK: 'LV', SD: 'LAC' }
const NBA_CODES = new Set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '))
const NBA_ALIASES: Record<string, string> = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN' }
const own = (record: Record<string, string>, key: string) => Object.hasOwn(record, key) ? record[key] : key
function nflCode(team?: string | null) {
  const key = team?.trim().toUpperCase() ?? '', code = own(NFL_ALIASES, key)
  return Object.hasOwn(NFL, code) ? code : Object.keys(NFL).find(code => NFL[code][0].toUpperCase() === key) ?? null
}

export function sportTeamLogoUrl(sport?: string | null, team?: string | null): string | null {
  const league = sport?.trim().toLowerCase(), key = team?.trim().toUpperCase() ?? ''
  if (league === 'mlb') return getTeamLogoUrl(key) ?? null
  if (league === 'nba') { const code = own(NBA_ALIASES, key); return NBA_CODES.has(code) ? nbaTeamLogo(code) : null }
  if (league !== 'nfl') return null
  const code = nflCode(team)
  return code ? `https://a.espncdn.com/i/teamlogos/nfl/${code === 'CAR' ? '500-dark' : '500'}/${code === 'WAS' ? 'wsh' : code.toLowerCase()}.png` : null
}

export function sportTeamBackground(sport?: string | null, team?: string | null) {
  const league = sport?.trim().toLowerCase()
  if (league === 'mlb') return getTeamColor(team)
  if (league === 'nba') return nbaTeamGradient(team)
  const code = league === 'nfl' ? nflCode(team) : null
  if (!code) return 'var(--surface-2)'
  const [, primary, secondary] = NFL[code]
  return `radial-gradient(ellipse at 20% 0%, ${secondary}b8 0%, transparent 66%), linear-gradient(145deg, ${primary} 12%, ${primary}d9 54%, ${secondary}b3 100%)`
}
