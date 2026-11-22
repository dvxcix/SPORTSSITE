import type { SupabaseClient } from '@supabase/supabase-js'
import { getBlockedEitherWayIds } from './blocks'

export async function searchMessageRecipients(client: SupabaseClient, userId: string, query: string) {
  const term = query.trim().slice(0, 64)
  if (term.length < 2) return []
  const blocked = await getBlockedEitherWayIds(client, userId)
  const pattern = JSON.stringify(`%${term.replace(/[\\%_]/g, '\\$&')}%`)
  let request = client.from('users')
    .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified')
    .neq('id', userId).eq('allow_dms', true)
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order('follower_count', { ascending: false }).order('id').limit(30)
  if (blocked.length) request = request.not('id', 'in', `(${blocked.join(',')})`)
  const { data, error } = await request
  if (error) throw new Error('Member search is temporarily unavailable')
  return data ?? []
}
