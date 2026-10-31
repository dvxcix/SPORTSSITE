import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MLB_HIBERNATING } from './mlbOffseason'

/** Hibernating MLB is available only to an authenticated administrator. */
export async function canViewMlb(supabase: SupabaseClient, userId: string | null | undefined): Promise<boolean> {
  if (!MLB_HIBERNATING) return true
  if (!userId) return false
  try {
    const { data, error } = await supabase.from('users').select('account_type').eq('id', userId).maybeSingle()
    return !error && data?.account_type === 'admin'
  } catch {
    return false
  }
}
