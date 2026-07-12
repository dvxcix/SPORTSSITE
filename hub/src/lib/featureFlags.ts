import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

// Central place mapping a nav item / route section to its site_settings
// toggle key, so the admin "Feature Flags" panel, the sidebar, and the
// route-level maintenance gates all agree on the same keys.
export const FEATURE_FLAGS = {
  blog: 'feature_blog',
  forum: 'feature_forum',
  marketplace: 'feature_marketplace',
  pages: 'feature_pages',
  pro_plan: 'feature_pro_plan',
  stories: 'feature_stories',
  events: 'feature_events',
} as const

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS]

// Client components (e.g. the sidebar) — fetches every known flag in one
// call so the nav can filter itself without a round trip per item. Kept in
// this client-safe file (no next/headers import) since bundling that into
// the browser breaks — see featureFlags.server.ts for the server variant.
export async function fetchFeatureFlagsClient(): Promise<Record<string, boolean>> {
  const supabase = createBrowserSupabase()
  const keys = Object.values(FEATURE_FLAGS)
  const { data } = await supabase.from('site_settings').select('key, value').in('key', keys)
  const flags: Record<string, boolean> = {}
  for (const key of keys) flags[key] = true // default enabled until proven otherwise
  for (const row of data ?? []) flags[row.key] = row.value === 'true'
  return flags
}
