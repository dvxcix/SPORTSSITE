import { createClient } from '@/lib/supabase/server'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import type { FeatureFlagKey } from '@/lib/featureFlags'
import { MaintenanceScreen, AdminPreviewBanner } from './MaintenanceScreen'

// Gates an entire route section (via that section's layout.tsx) behind a
// site_settings toggle. Admins still see the real content (with a banner)
// so they can keep working on it while it's hidden from everyone else —
// that's the point of the toggle, not just hiding a sidebar link.
export async function FeatureGate({ flag, label, children }: {
  flag: FeatureFlagKey
  label: string
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const [enabled, { data: { user } }] = await Promise.all([
    isFeatureEnabledServer(flag),
    supabase.auth.getUser(),
  ])

  if (enabled) return <>{children}</>

  let isAdmin = false
  if (user) {
    const { data } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
    isAdmin = data?.account_type === 'admin'
  }

  if (isAdmin) {
    return (
      <>
        <AdminPreviewBanner label={label} />
        {children}
      </>
    )
  }

  return <MaintenanceScreen label={label} />
}
