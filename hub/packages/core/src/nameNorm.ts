// Shared player-name normalization + fuzzy matching for joining data
// sources that each spell a player's name slightly differently — a
// manually-pasted sportsbook scrape, BDL's own feed, and MLB's Stats API
// roster/lineup data all describe the same person with different strings
// often enough that exact-string matching silently drops real data.
export const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ').trim()

// Provider-side identity keys may carry a disambiguator that the display
// name intentionally does not.  The important production example is
// "Max Muncy (2002)" (Athletics) versus "Max Muncy" (Dodgers).  `normName`
// is still the right key for ordinary display-name comparisons, but it
// deliberately drops digits and therefore must never be used to index a
// provider's identity-bearing key.
export const normProviderPlayerKey = (s: string) =>
  (s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[`'’?-]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()

// MLB Party historically used one trailing space as the only discriminator
// for the Athletics player (`"max muncy "`).  Preserve that meaning while
// old snapshots age out; blindly trimming first recreates the collision.
export const canonicalProviderArchiveKey = (s: string) => {
  if (/^max muncy\s+$/i.test(s || '')) return 'max muncy 2002'
  return normProviderPlayerKey(s)
}

export type PlayerIdentityCandidate = {
  mlbId: number
  name: string
  team?: string | null
}

// BDL has stable player IDs, so retain the few explicit cross-provider IDs
// needed when MLB itself has two active players with the same full name.
// Ordinary players continue through the generic name+team resolver below.
const BDL_TO_MLB_ID: Record<string, number> = {
  '142': 571970,    // Max Muncy, LAD
  '241414': 691777, // Max Muncy, Athletics (born 2002)
}

const stripMiddleInitial = (nn: string) => {
  const tokens = nn.split(' ').filter(Boolean)
  if (tokens.length < 3) return nn
  return tokens.filter((token, index) => index === 0 || index === tokens.length - 1 || token.length > 1).join(' ')
}

const sameTeam = (a?: string | null, b?: string | null) => {
  if (!a || !b) return true
  const aliases: Record<string, string> = { OAK: 'ATH', ATH: 'ATH', WSN: 'WSH', WSH: 'WSH', CHW: 'CWS', CWS: 'CWS', TBR: 'TB', TB: 'TB', KCR: 'KC', KC: 'KC', SDP: 'SD', SD: 'SD', SFG: 'SF', SF: 'SF', ARI: 'AZ', AZ: 'AZ' }
  return (aliases[a.toUpperCase()] ?? a.toUpperCase()) === (aliases[b.toUpperCase()] ?? b.toUpperCase())
}

// Resolve one provider row against the players in THIS game.  Every fuzzy
// fallback must produce exactly one candidate; ambiguous names fail closed
// instead of silently assigning one player's markets to another player.
export function resolvePlayerIdentity(
  candidates: PlayerIdentityCandidate[],
  sourceName: string,
  options: { provider?: 'bdl' | string; sourceId?: string | number | null; sourceTeam?: string | null } = {},
): PlayerIdentityCandidate | undefined {
  if (options.provider === 'bdl' && options.sourceId != null) {
    const mlbId = BDL_TO_MLB_ID[String(options.sourceId)]
    if (mlbId) return candidates.find(candidate => candidate.mlbId === mlbId)
  }

  // Sportsbooks commonly add the middle initial only for the Athletics
  // player. Keep that provider-owned discriminator before any fuzzy pass so
  // even a future LAD/ATH game containing both players remains unambiguous.
  const providerKey = normProviderPlayerKey(sourceName)
  if (providerKey === 'max p muncy' || providerKey === 'max muncy 2002') {
    return candidates.find(candidate => candidate.mlbId === 691777)
  }

  const teamCandidates = candidates.filter(candidate => sameTeam(candidate.team, options.sourceTeam))
  const pool = teamCandidates.length ? teamCandidates : candidates
  const source = normName(sourceName.replace(/\s+\(\d{4}\)\s*$/, ''))
  const exact = pool.filter(candidate => normName(candidate.name) === source)
  if (exact.length === 1) return exact[0]

  const withoutMiddle = stripMiddleInitial(source)
  const middleMatches = pool.filter(candidate => stripMiddleInitial(normName(candidate.name)) === withoutMiddle)
  if (middleMatches.length === 1) return middleMatches[0]

  const canonical = canonicalizeForMatch(source)
  const fuzzy = pool.filter(candidate => canonicalizeForMatch(normName(candidate.name)) === canonical)
  return fuzzy.length === 1 ? fuzzy[0] : undefined
}

// Keys used by MLB Party's season-average archive.  The birth-year key is
// provider-owned identity, while "Max P. Muncy" is the sportsbook display
// alias seen in FanDuel imports.  The legacy-accent key keeps historical
// rows readable while the source archive is being repaired (the old trigger
// deleted accented letters instead of transliterating them).
export function providerKeysForPlayer(mlbId: number, displayName: string): string[] {
  const keys = new Set<string>()
  // Specific identity-bearing aliases must precede the shared display name
  // or Athletics Max would still resolve Dodgers Max's unqualified row.
  if (mlbId === 691777) {
    keys.add('max muncy 2002')
    keys.add('max p muncy')
  } else {
    keys.add(normProviderPlayerKey(displayName))
  }
  const normalizedDisplay = normProviderPlayerKey(displayName)
  const legacyAccentDrop = normProviderPlayerKey(displayName.replace(/[^\x00-\x7F]/g, ''))
  if (legacyAccentDrop && legacyAccentDrop !== normalizedDisplay) keys.add(legacyAccentDrop)
  return [...keys]
}

export function resolveProviderEntryForPlayer<T>(
  map: Record<string, T>,
  player: { mlbId: number; name: string },
): T | undefined {
  for (const key of providerKeysForPlayer(player.mlbId, player.name)) {
    if (key in map) return map[key]
  }
  return undefined
}

// MLB's Stats API is inconsistent about whether a generational suffix
// shows up in a player's fullName (confirmed live: "Jazz Chisholm Jr."),
// while a sportsbook's own scrape frequently drops it entirely ("Jazz
// Chisholm"). Neither side is wrong — they just don't agree — so matching
// has to tolerate the suffix being present on one side and absent on the
// other, not require both sides to spell it the same way.
const stripSuffix = (nn: string) => nn.replace(/\s+(jr|sr|ii|iii|iv)$/, '').trim()

// Common English first-name / nickname pairs, grouped so any member is
// treated as equivalent to any other in its group — e.g. "cam cauley" and
// "cameron cauley" resolve to the same person. This is inherently
// best-effort (there's no way to derive a nickname from spelling alone);
// extend this list whenever a real mismatch turns up rather than trying to
// make it exhaustive up front.
const NICKNAME_GROUPS: string[][] = [
  ['cam', 'cameron'], ['mike', 'michael', 'mikey'], ['alex', 'alexander', 'alejandro'],
  ['nick', 'nicholas', 'nicky'], ['josh', 'joshua'], ['matt', 'matthew'],
  ['chris', 'christopher'], ['zach', 'zachary', 'zack', 'zac'],
  ['will', 'william', 'billy', 'bill'], ['rob', 'robert', 'bob', 'bobby', 'robby'],
  ['jake', 'jacob'], ['dan', 'danny', 'daniel'], ['tony', 'anthony'],
  ['sam', 'samuel', 'sammy'], ['vinny', 'vincent', 'vince'],
  ['tommy', 'thomas', 'tom'], ['kenny', 'kenneth', 'ken'],
  ['joey', 'joseph', 'joe', 'jose'], ['jimmy', 'james', 'jim'],
  ['manny', 'manuel'], ['freddy', 'freddie', 'frederick', 'fred'],
  ['eddie', 'edward', 'ed', 'eduardo'], ['charlie', 'charles', 'chuck'],
  ['gabe', 'gabriel'], ['nate', 'nathan', 'nathaniel'], ['andy', 'andrew', 'andres'],
  ['ben', 'benjamin', 'benji'], ['dave', 'david', 'davey'], ['greg', 'gregory'],
  ['jeff', 'jeffrey'], ['larry', 'lawrence'], ['pat', 'patrick'],
  ['pete', 'peter'], ['ron', 'ronald', 'ronnie'], ['ted', 'theodore', 'teddy'],
  ['tim', 'timothy', 'timmy'], ['walt', 'walter'], ['harry', 'harold'],
  ['al', 'albert', 'alberto'], ['abe', 'abraham'],
  ['fernando', 'nando'], ['ricky', 'richard', 'rick', 'ricardo'],
  ['tobias', 'toby'], ['isaac', 'ike'], ['gus', 'gustavo', 'augustus'],
  ['johnny', 'jonathan', 'john', 'jon'],
  ['donnie', 'donovan', 'don', 'donald'],
]
const NICKNAME_CANONICAL: Record<string, string> = {}
for (const group of NICKNAME_GROUPS) {
  for (const name of group) NICKNAME_CANONICAL[name] = group[0]
}
const nicknameCanonical = (token: string) => NICKNAME_CANONICAL[token] ?? token

// Reduces a normalized name to a form that's stable across suffix and
// nickname spelling differences, for COMPARISON only — never store this,
// it deliberately throws away information a real display string needs.
function canonicalizeForMatch(nn: string): string {
  const tokens = stripSuffix(nn).split(' ').filter(Boolean)
  if (!tokens.length) return nn
  return [nicknameCanonical(tokens[0]), ...tokens.slice(1)].join(' ')
}

// Looks up `name` (already normName'd) in `map`, first by exact key (the
// common, cheap case), then by suffix/nickname-tolerant comparison against
// every key actually present — map sizes here are a roster's worth of
// players (dozens), so a full scan on the fallback path is negligible.
export function resolveNameEntry<T>(map: Record<string, T>, name: string): T | undefined {
  if (name in map) return map[name]
  const target = canonicalizeForMatch(name)
  for (const [k, v] of Object.entries(map)) {
    if (canonicalizeForMatch(k) === target) return v
  }
  return undefined
}
