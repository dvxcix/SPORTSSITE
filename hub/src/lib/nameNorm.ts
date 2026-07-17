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
