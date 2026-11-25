import type { SupabaseClient } from '@supabase/supabase-js'
import { isAccountId } from './blocks'
import { FEATURE_FLAGS } from './featureFlags'
import { isFeatureEnabledServer } from './featureFlags.server'

export async function nativePagePublishing(supabase: SupabaseClient, userId: string, id: string) {
  if (!isAccountId(id)) return { status: 400, error: 'Choose a valid page.' } as const
  if (!await isFeatureEnabledServer(FEATURE_FLAGS.pages, false, { supabase, userId })) {
    return { status: 403, error: 'Pages are currently unavailable.' } as const
  }
  const { data, error } = await supabase.from('pages').select('id').eq('id', id).eq('owner_id', userId).maybeSingle()
  if (error) return { status: 503, error: 'Page access could not be verified.' } as const
  if (!data) return { status: 403, error: 'You cannot publish to this page.' } as const
  return { id: data.id as string }
}
