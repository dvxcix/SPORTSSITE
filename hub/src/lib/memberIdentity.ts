/** The same membership color on posts, profile cards, settings and saved picks. */
export function memberTone(member?: { tier?: string | null; account_type?: string | null } | null): 'default' | 'creator' | 'advanced' | 'ultimate' {
  if (member?.tier === 'ultimate') return 'ultimate'
  if (member?.tier === 'advanced') return 'advanced'
  return member?.account_type === 'creator' ? 'creator' : 'default'
}
