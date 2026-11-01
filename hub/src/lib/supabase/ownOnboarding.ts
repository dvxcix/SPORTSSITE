import type { SupabaseClient } from '@supabase/supabase-js'

// The database derives the account only from the caller's verified JWT. This
// result is deliberately never cached across requests or accounts.
export async function ownOnboardingComplete(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('get_own_onboarding_complete')
  if (error || typeof data !== 'boolean') throw new Error('Onboarding state unavailable')
  return data
}
