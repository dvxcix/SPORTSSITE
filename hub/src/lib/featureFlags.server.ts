import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FeatureFlagKey, FeatureRollout } from './featureFlags'

function cohortBucket(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

export function resolveFeatureRollout(rollout: Pick<FeatureRollout, 'audience' | 'rollout_percent' | 'rollout_salt'>, identity: { userId: string | null; isAdmin: boolean }) {
  if (identity.isAdmin) return true
  if (rollout.audience === 'everyone') return true
  if (rollout.audience === 'off' || rollout.audience === 'admins') return false
  if (!identity.userId) return false
  if (rollout.audience === 'members') return true
  return cohortBucket(`${rollout.rollout_salt}:${identity.userId}`) < rollout.rollout_percent
}

// Server components / layouts only (imports next/headers transitively via
// the server Supabase client) — used to gate an entire route section behind
// a flag, e.g. hide /blog for everyone while it's being reworked. Kept out
// of featureFlags.ts so client components can import the flag constants/
// client fetcher from there without pulling this into the browser bundle.
export async function getFeatureFlagsServer(keys: FeatureFlagKey[], fallback = true): Promise<Record<FeatureFlagKey, boolean>> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
    isAdmin = profile?.account_type === 'admin'
  }

  try {
    const admin = createAdminClient()
    const [{ data: rollouts }, { data: overrides }] = await Promise.all([
      admin.from('feature_rollouts').select('feature_key, audience, rollout_percent, rollout_salt').in('feature_key', keys),
      user ? admin.from('feature_rollout_overrides').select('feature_key, enabled').in('feature_key', keys).eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])
    if (rollouts?.length) {
      const rolloutByKey = new Map(rollouts.map(row => [row.feature_key, row]))
      const overrideByKey = new Map((overrides ?? []).map(row => [row.feature_key, row.enabled]))
      const missing = keys.filter(key => !rolloutByKey.has(key))
      const { data: legacy } = missing.length ? await supabase.from('site_settings').select('key, value').in('key', missing) : { data: [] }
      const legacyByKey = new Map((legacy ?? []).map(row => [row.key, row.value === 'true']))
      return Object.fromEntries(keys.map(key => {
        const override = overrideByKey.get(key)
        if (typeof override === 'boolean') return [key, isAdmin || override]
        const rollout = rolloutByKey.get(key)
        if (rollout) return [key, resolveFeatureRollout(rollout as Pick<FeatureRollout, 'audience' | 'rollout_percent' | 'rollout_salt'>, { userId: user?.id ?? null, isAdmin })]
        return [key, legacyByKey.get(key) ?? fallback]
      })) as Record<FeatureFlagKey, boolean>
    }
  } catch {}

  const { data } = await supabase.from('site_settings').select('key, value').in('key', keys)
  const legacyByKey = new Map((data ?? []).map(row => [row.key, row.value === 'true']))
  return Object.fromEntries(keys.map(key => [key, legacyByKey.get(key) ?? fallback])) as Record<FeatureFlagKey, boolean>
}

export async function isFeatureEnabledServer(key: FeatureFlagKey, fallback = true): Promise<boolean> {
  return (await getFeatureFlagsServer([key], fallback))[key]
}
