import type { CommunityDirectoryEntry } from './creatorCommunityDirectory'
export type CommunityCollection = { id: string; primary: CommunityDirectoryEntry; spaces: CommunityDirectoryEntry[]; joined: boolean }
/** One creator destination; each distinct access level keeps its own protected space. */
export function communityCollections(groups: CommunityDirectoryEntry[], joinedIds: string[], userId: string | null, invitations: CommunityDirectoryEntry[] = []): CommunityCollection[] {
  const joined = new Set(joinedIds), unique = new Map(groups.map(group => [group.id, { ...group }]))
  for (const invitation of invitations) unique.set(invitation.id, { ...unique.get(invitation.id), ...invitation })
  const collections = new Map<string, CommunityDirectoryEntry[]>()
  for (const group of unique.values()) { const key = group.owner_id || group.id; collections.set(key, [...collections.get(key) ?? [], group]) }
  const priority = (group: CommunityDirectoryEntry) => (group.owner_id === userId || joined.has(group.id) ? 100 : 0) + (group.invitationId ? 20 : 0) + (group.access_type === 'paid' ? 5 : 0)
  return [...collections].map(([id, spaces]) => {
    spaces.sort((a, b) => priority(b) - priority(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    return { id, primary: spaces[0], spaces, joined: spaces.some(group => group.owner_id === userId || joined.has(group.id) || Boolean(group.invitationId)) }
  }).sort((a, b) => a.primary.name.localeCompare(b.primary.name))
}
export function communityMatches(group: CommunityDirectoryEntry, search: string, access: string, sport: string) {
  return `${group.name} ${group.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()) && (access === 'all' || (group.access_type || 'free') === access) && (sport === 'all' || group.sport?.toUpperCase() === sport)
}
