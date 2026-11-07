import { nbaName, type PaintRoster } from './nbaPaint'
import { nbaPlayerIdentities } from './nbaPlayerIdentity'

// Artwork aliases only. These do not change sportsbook identity or saved data.
// ESPN's team roster and the provider directory were compared by exact player.
const portraits = [
  { id: 1028028405, names: ['Alexandre Sarr', 'Alex Sarr'], espn: 5160992 },
  { id: 1028025235, names: ['Carlton Carrington', 'Bub Carrington'], espn: 4845374 },
  { id: 666508, names: ['Nicolas Claxton', 'Nic Claxton'], espn: 4278067 },
  { id: 17896031, names: ["Nah'Shon Hyland", 'Bones Hyland'], espn: 4592492 },
  { id: 1057275769, names: ['Hansen Yang', 'Yang Hansen'], espn: 5217746 },
  { id: 1028245237, names: ['David Jones', 'David Jones Garcia'], espn: 4713010 },
  { id: 1057260888, names: ['Airious Bailey', 'Ace Bailey'], espn: 4873138 },
  // Official NBA player profiles provide these portraits when ESPN omits them.
  { id: 1091360181, names: ['Chris Cenac Jr.'], nba: 1643416 },
  { id: 1095497363, names: ['Khalifa Diop'], nba: 1631215 },
  { id: 1028245994, names: ['Riley Minix'], nba: 1642434 },
  { id: 1057848025, names: ['Norchad Omier'], nba: 1641807 },
  { id: 1042560902, names: ["Nae'Qwan Tomlin"], nba: 1641772 },
  { id: 1091467104, names: ['Bruce Thornton'], nba: 1643570 },
] as const

/** A stable, verified player-ID fallback is presentation metadata. It never
 * reads current statistics/rosters or modifies archived pregame observations. */
export function nbaPortraitFallback(playerId: number | string | null | undefined): string | null {
  const raw = String(playerId ?? '').replace(/^bdl:/, '')
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null
  const entry = portraits.find(row => row.id === Number(raw))
  return !entry ? null : 'espn' in entry ? `https://a.espncdn.com/i/headshots/nba/players/full/${entry.espn}.png` : `https://cdn.nba.com/headshots/nba/latest/1040x760/${entry.nba}.png`
}

/** Resolve only exact names or ID-pinned aliases within the supplied team.
 * Ambiguous roster names, duplicate IDs and conflicting image candidates stay
 * unavailable. Never match a surname or guess a similar first name. */
export function nbaRosterPortraits<T extends Pick<PaintRoster, 'id' | 'first_name' | 'last_name'>>(
  roster: T[], headshots: ReadonlyMap<string, string | null>,
): Map<number, string | null> {
  const identities = nbaPlayerIdentities(roster).map(({ player, names }) => {
    const known = portraits.find(row => row.id === player.id && row.names.some(name => nbaName(name) === nbaName(`${player.first_name} ${player.last_name}`)))
    return { player, known, names: [...new Set([...names, ...(known?.names.map(nbaName) ?? [])])] }
  })
  const owners = new Map<string, Set<number>>(), counts = new Map<number, number>()
  for (const { player, names } of identities) {
    counts.set(player.id, (counts.get(player.id) ?? 0) + 1)
    for (const name of names) { const ids = owners.get(name) ?? new Set<number>(); ids.add(player.id); owners.set(name, ids) }
  }
  return new Map(identities.map(({ player, known, names }) => {
    if (counts.get(player.id) !== 1 || names.some(name => owners.get(name)?.size !== 1)) return [player.id, null]
    const candidates = new Set(names.map(name => headshots.get(name)).filter((url): url is string => !!url && url.startsWith('https://')))
    return [player.id, candidates.size === 1 ? [...candidates][0] : candidates.size === 0 && known ? nbaPortraitFallback(player.id) : null]
  }))
}
