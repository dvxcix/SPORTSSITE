export function hasCreatorAccess(accountType?: string | null, approved = false) {
  return accountType === 'creator' || approved
}

export async function hasApprovedCreatorAccess(supabase: SupabaseClient, userId: string, accountType?: string | null) {
  if (accountType === 'creator') return true
  const { data } = await supabase.from('creator_applications').select('id').eq('user_id', userId).eq('status', 'approved').maybeSingle()
  return Boolean(data)
}
import type { SupabaseClient } from '@supabase/supabase-js'
