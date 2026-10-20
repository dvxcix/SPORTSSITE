// Team brand metadata verified against the league's ESPN team directory on 2026-10-20.
// Keep this local so every player surface has the same colors without another request.
const NBA_TEAM_COLORS: Record<string, readonly [string, string]> = {
  ATL: ['#c8102e', '#fdb927'], BOS: ['#008348', '#ffffff'],
  BKN: ['#000000', '#ffffff'], CHA: ['#008ca8', '#1d1060'],
  CHI: ['#ce1141', '#000000'], CLE: ['#860038', '#bc945c'],
  DAL: ['#0064b1', '#bbc4ca'], DEN: ['#0e2240', '#fec524'],
  DET: ['#1d428a', '#c8102e'], GSW: ['#fdb927', '#1d428a'],
  HOU: ['#ce0e2d', '#000000'], IND: ['#0c2340', '#ffd520'],
  LAC: ['#12173f', '#c8102e'], LAL: ['#552583', '#fdb927'],
  MEM: ['#5d76a9', '#12173f'], MIA: ['#98002e', '#000000'],
  MIL: ['#00471b', '#eee1c6'], MIN: ['#266092', '#79bc43'],
  NOP: ['#0a2240', '#b4975a'], NYK: ['#1d428a', '#f58426'],
  OKC: ['#007ac1', '#ef3b24'], ORL: ['#0150b5', '#9ca0a3'],
  PHI: ['#1d428a', '#e01234'], PHX: ['#29127a', '#e56020'],
  POR: ['#e03a3e', '#000000'], SAC: ['#5a2d81', '#6a7a82'],
  SAS: ['#000000', '#c4ced4'], TOR: ['#d91244', '#000000'],
  UTA: ['#4e008e', '#79a3dc'], WAS: ['#e31837', '#002b5c'],
}
const ALIASES: Record<string, string> = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN' }
export function nbaTeamColors(abbreviation?: string | null): readonly [string, string] {
  const key = abbreviation?.trim().toUpperCase() ?? ''
  return NBA_TEAM_COLORS[ALIASES[key] ?? key] ?? ['#263542', '#141c25']
}
export function nbaTeamGradient(abbreviation?: string | null) {
  const [primary, secondary] = nbaTeamColors(abbreviation)
  return `radial-gradient(ellipse at 20% 0%, ${secondary}b8 0%, transparent 66%), linear-gradient(145deg, ${primary} 12%, ${primary}d9 54%, ${secondary}b3 100%)`
}
