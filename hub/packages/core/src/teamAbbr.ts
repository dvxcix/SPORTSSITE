// MLB's own schedule API isn't stable about which abbreviation it returns
// for a handful of teams — confirmed directly: Arizona came back as "ARI"
// at one point today and "AZ" a couple hours later from the exact same
// endpoint/hydration dugout/data and the admin import dropdowns both use.
// That drift is invisible until it silently breaks a game_key match. Every
// producer of a game_key (dugout/data, bdl-odds cron, fanduel-import) must
// canonicalize through this same table so all three agree on one string.
export const TEAM_ABBR_ALIASES: Record<string, string> = {
  ARI: 'AZ', AZ: 'AZ',
  TBR: 'TB', TB: 'TB',
  SDP: 'SD', SD: 'SD',
  SFG: 'SF', SF: 'SF',
  KCR: 'KC', KC: 'KC',
  CHW: 'CWS', CWS: 'CWS',
  WSN: 'WSH', WSH: 'WSH',
}
export const canonAbbr = (a: string) => TEAM_ABBR_ALIASES[(a || '').toUpperCase()] ?? (a || '').toUpperCase()
export const canonGameKey = (key: string) => {
  const m = key.match(/^([A-Za-z]+)@([A-Za-z]+)(-G\d+)?$/)
  if (!m) return key
  return `${canonAbbr(m[1])}@${canonAbbr(m[2])}${m[3] ?? ''}`
}
