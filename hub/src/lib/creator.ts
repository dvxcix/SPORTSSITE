export function hasCreatorAccess(accountType?: string | null, approved = false) {
  return accountType === 'admin' || accountType === 'creator' || approved
}

export async function hasApprovedCreatorAccess(supabase: SupabaseClient, userId: string, accountType?: string | null) {
  if (hasCreatorAccess(accountType)) return true
  const { data, error } = await supabase.from('creator_applications').select('id').eq('user_id', userId).eq('status', 'approved').maybeSingle()
  if (error) throw new Error('Creator approval could not be checked')
  return Boolean(data)
}
import type { SupabaseClient } from '@supabase/supabase-js'
