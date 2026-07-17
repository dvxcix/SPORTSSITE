// MLB team primary colors, keyed by abbreviation. Used as the backdrop behind
// transparent-background player headshots so players are visually
// differentiated by team at a glance, everywhere a headshot appears.
export const MLB_TEAM_COLORS: Record<string, string> = {
  ARI: '#A71930', AZ: '#A71930', ATL: '#CE1141', BAL: '#DF4601', BOS: '#BD3039',
  CHC: '#0E3386', CWS: '#27251F', CIN: '#C6011F', CLE: '#00385D',
  COL: '#33006F', DET: '#0C2C56', HOU: '#EB6E1F', KC: '#004687',
  LAA: '#BA0021', LAD: '#005A9C', MIA: '#00A3E0', MIL: '#12284B',
  MIN: '#002B5C', NYM: '#002D72', NYY: '#003087', ATH: '#003831',
  OAK: '#003831', PHI: '#E81828', PIT: '#FDB827', SD: '#2F241D',
  SF: '#FD5A1E', SEA: '#0C2C56', STL: '#C41E3A', TB: '#092C5C',
  TEX: '#003278', TOR: '#134A8E', WSH: '#AB0003',
}

export function getTeamColor(abbr?: string | null): string {
  if (!abbr) return 'var(--surface-2)'
  return MLB_TEAM_COLORS[abbr.toUpperCase()] ?? 'var(--surface-2)'
}

// MLB team secondary colors — used alongside MLB_TEAM_COLORS anywhere a
// two-tone team treatment is wanted (e.g. Weather Lab's park cards: primary
// for the outfield, secondary for the infield dirt).
export const MLB_TEAM_SECONDARY_COLORS: Record<string, string> = {
  ARI: '#E3D4AD', AZ: '#E3D4AD', ATL: '#13274F', BAL: '#000000', BOS: '#0C2340',
  CHC: '#CC3433', CWS: '#C4CED4', CIN: '#000000', CLE: '#E50022',
  COL: '#C4CED4', DET: '#FA4616', HOU: '#002D62', KC: '#BD9B60',
  LAA: '#003263', LAD: '#A5ACAF', MIA: '#EF3340', MIL: '#FFC52F',
  MIN: '#D31145', NYM: '#FF5910', NYY: '#C4CED3', ATH: '#EFB21E',
  OAK: '#EFB21E', PHI: '#002D72', PIT: '#27251F', SD: '#FFC425',
  SF: '#27251F', SEA: '#005C5C', STL: '#0C2340', TB: '#8FBCE6',
  TEX: '#C0111F', TOR: '#E8291C', WSH: '#14225A',
}

export function getTeamSecondaryColor(abbr?: string | null): string {
  if (!abbr) return 'var(--surface-3)'
  return MLB_TEAM_SECONDARY_COLORS[abbr.toUpperCase()] ?? 'var(--surface-3)'
}

// MLB.com numeric team ids, keyed by abbreviation — for team-logos.svg URLs.
export const MLB_TEAM_IDS: Record<string, number> = {
  ARI: 109, AZ: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113, CLE: 114, COL: 115,
  DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121,
  NYY: 147, ATH: 133, OAK: 133, PHI: 143, PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138,
  TB: 139, TEX: 140, TOR: 141, WSH: 120,
}

export function getTeamLogoUrl(abbr?: string | null): string | undefined {
  if (!abbr) return undefined
  const id = MLB_TEAM_IDS[abbr.toUpperCase()]
  return id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : undefined
}

// Full team names, keyed by abbreviation — the logo already carries the
// team identity visually everywhere it's shown next to a name, so full
// names (not the 2-3 letter code) read better as the accompanying text.
export const MLB_TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Diamondbacks', AZ: 'Arizona Diamondbacks', ATL: 'Atlanta Braves',
  BAL: 'Baltimore Orioles', BOS: 'Boston Red Sox', CHC: 'Chicago Cubs',
  CWS: 'Chicago White Sox', CIN: 'Cincinnati Reds', CLE: 'Cleveland Guardians',
  COL: 'Colorado Rockies', DET: 'Detroit Tigers', HOU: 'Houston Astros',
  KC: 'Kansas City Royals', LAA: 'Los Angeles Angels', LAD: 'Los Angeles Dodgers',
  MIA: 'Miami Marlins', MIL: 'Milwaukee Brewers', MIN: 'Minnesota Twins',
  NYM: 'New York Mets', NYY: 'New York Yankees', ATH: 'Athletics', OAK: 'Athletics',
  PHI: 'Philadelphia Phillies', PIT: 'Pittsburgh Pirates', SD: 'San Diego Padres',
  SF: 'San Francisco Giants', SEA: 'Seattle Mariners', STL: 'St. Louis Cardinals',
  TB: 'Tampa Bay Rays', TEX: 'Texas Rangers', TOR: 'Toronto Blue Jays', WSH: 'Washington Nationals',
}

export function getTeamName(abbr?: string | null): string {
  if (!abbr) return ''
  return MLB_TEAM_NAMES[abbr.toUpperCase()] ?? abbr
}

// Teams whose logo nearly disappears directly on a plain dark surface (e.g.
// a modal header) — fine sitting on their own team-color backdrop elsewhere
// in the app, just not on flat dark. A brightness-off-the-primary-color
// heuristic here mis-flagged/mis-missed teams and, worse, callers were using
// plain invert(1) which flips HUES on multi-color logos (a red logo turns
// cyan) instead of giving a clean white silhouette — so this is now an
// explicit, deliberately curated list, paired with `LOGO_WHITE_FILTER`
// (brightness(0) invert(1), which forces solid white regardless of the
// logo's original colors, not a hue-flip).
const DARK_LOGO_TEAMS = new Set(['ATH', 'OAK', 'KC', 'DET', 'NYY', 'SD', 'COL'])

export function isDarkTeamLogo(abbr?: string | null): boolean {
  if (!abbr) return false
  return DARK_LOGO_TEAMS.has(abbr.toUpperCase())
}

// Forces a logo to solid white (any color in, white silhouette out) —
// unlike invert(1) alone, which flips hues rather than flattening to white.
export const LOGO_WHITE_FILTER = 'brightness(0) invert(1)'
