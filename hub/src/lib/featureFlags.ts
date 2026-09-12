// Central place mapping a nav item / route section to its site_settings
// toggle key, so the admin "Feature Flags" panel, the sidebar, and the
// route-level maintenance gates all agree on the same keys.
export const FEATURE_FLAGS = {
  blog: 'feature_blog',
  forum: 'feature_forum',
  marketplace: 'feature_marketplace',
  pages: 'feature_pages',
  stories: 'feature_stories',
  events: 'feature_events',
  groups: 'feature_groups',
  polls: 'feature_polls',
  watchlist: 'feature_watchlist',
} as const

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS]
export type FeatureRolloutAudience = 'off' | 'admins' | 'members' | 'percentage' | 'everyone'

export type FeatureRollout = {
  feature_key: FeatureFlagKey
  audience: FeatureRolloutAudience
  rollout_percent: number
  rollout_salt: string
  updated_at: string
}

// Client components (e.g. the sidebar) — fetches every known flag in one
// call so the nav can filter itself without a round trip per item. Kept in
// this client-safe file (no next/headers import) since bundling that into
// the browser breaks — see featureFlags.server.ts for the server variant.
export async function fetchFeatureFlagsClient(): Promise<Record<string, boolean>> {
  const keys = Object.values(FEATURE_FLAGS)
  const flags: Record<string, boolean> = {}
  for (const key of keys) flags[key] = true
  try {
    const response = await fetch('/api/features', { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) return flags
    const body = await response.json() as { flags?: Record<string, boolean> }
    for (const key of keys) if (typeof body.flags?.[key] === 'boolean') flags[key] = body.flags[key]
  } catch {}
  return flags
}
