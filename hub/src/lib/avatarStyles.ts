import catalog from './avatarDecorations.json'

export const RING_STYLES = ['surge', 'pulse', 'orbit', 'solid', 'none'] as const
export type RingStyle = typeof RING_STYLES[number]
export type MemberRingStyle = RingStyle | `deco:${string}`
export const AVATAR_DECORATIONS = catalog
export type AvatarDecorationEntry = typeof catalog[number]
const byId = new Map(catalog.map(item => [item.id, item]))

export function avatarDecoration(value: unknown): AvatarDecorationEntry | undefined {
  return typeof value === 'string' && value.startsWith('deco:') ? byId.get(value.slice(5)) : undefined
}

export function isAvatarStyle(value: unknown): value is MemberRingStyle {
  return typeof value === 'string' && (RING_STYLES.some(style => style === value) || !!avatarDecoration(value))
}

export function avatarStyleName(value: MemberRingStyle): string {
  return avatarDecoration(value)?.name ?? (value === 'none' ? 'No decoration' : `${value[0].toUpperCase() + value.slice(1)} ring`)
}

export function decorationPath(item: AvatarDecorationEntry, animate = false): string {
  // Only catalog entries can produce URLs, even if a persisted value is invalid.
  return byId.has(item.id) ? `/avatar-decorations/${animate ? 'animated' : 'still'}/${item.id}.svg` : ''
}
