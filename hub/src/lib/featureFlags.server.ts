import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { FeatureFlagKey } from './featureFlags'

// Server components / layouts only (imports next/headers transitively via
// the server Supabase client) — used to gate an entire route section behind
// a flag, e.g. hide /blog for everyone while it's being reworked. Kept out
// of featureFlags.ts so client components can import the flag constants/
// client fetcher from there without pulling this into the browser bundle.
export async function isFeatureEnabledServer(key: FeatureFlagKey, fallback = true): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle()
  if (!data) return fallback
  return data.value === 'true'
}
