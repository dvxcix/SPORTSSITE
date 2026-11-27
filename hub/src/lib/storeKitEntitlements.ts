import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export const ULTIMATE_STOREKIT_PRODUCT = 'com.slipsurge.ios.ultimate.monthly'
export type StoreKitEnvironment = 'Production' | 'Sandbox'

export function storeKitEnvironmentAllowed(environment: StoreKitEnvironment, userId: string) {
  if (environment === 'Production') return process.env.SLIPSURGE_STOREKIT_PRODUCTION === '1'
  const testers = (process.env.SLIPSURGE_STOREKIT_SANDBOX_USERS ?? '').toLowerCase().split(',').map(value => value.trim())
  return testers.includes(userId.toLowerCase())
}

export function offersStoreKit(userId: string) {
  return storeKitEnvironmentAllowed('Production', userId) || storeKitEnvironmentAllowed('Sandbox', userId)
}

export async function storeKitMembership(userId: string): Promise<{ access_until: string } | null> {
  const environments = (['Production', 'Sandbox'] as const)
    .filter(environment => storeKitEnvironmentAllowed(environment, userId))
  if (!environments.length) return null

  const { data, error } = await createAdminClient()
    .from('native_storekit_subscriptions')
    .select('access_until')
    .eq('user_id', userId)
    .eq('product_id', ULTIMATE_STOREKIT_PRODUCT)
    .in('environment', environments)
    .gt('access_until', new Date().toISOString())
    .order('access_until', { ascending: false })
    .limit(1).maybeSingle()
  if (error) throw new Error('Apple subscription access unavailable')
  return data?.access_until ? { access_until: data.access_until } : null
}

export async function ownsStoreKitUltimate(userId: string) {
  // Existing entitlements continue to work independently of an Apple lookup.
  return Boolean(await storeKitMembership(userId).catch(() => null))
}
