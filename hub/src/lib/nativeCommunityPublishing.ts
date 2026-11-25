import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAccountId } from './blocks'
import { canViewMlb } from './mlbViewerAccess'

export async function nativeCommunityPublishing(client: SupabaseClient, userId: string, groupId: string) {
  if (!isAccountId(groupId)) return { status: 400 as const, error: 'Choose a valid community' }
  const [group, membership] = await Promise.all([
    client.from('groups').select('sport,is_public,access_type').eq('id', groupId).maybeSingle(),
    client.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', userId).maybeSingle(),
  ])
  if (group.error || membership.error) return { status: 503 as const, error: 'Community access couldn’t be checked' }
  if (!group.data || !membership.data || group.data.sport?.toUpperCase() === 'MLB' && !await canViewMlb(client, userId)) {
    return { status: 403 as const, error: 'Community membership required' }
  }
  return { public: group.data.is_public && group.data.access_type !== 'paid' }
}
