import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAccountId } from './blocks'
import { canViewMlb } from './mlbViewerAccess'

type Capabilities = { manage_channels?: boolean; manage_roles?: boolean; manage_members?: boolean; create_invites?: boolean }

export async function nativeCommunitySettingsAccess(client: SupabaseClient, userId: string, id: string) {
  const [group, member] = await Promise.all([
    client.from('groups').select('id,name,slug,description,rules,sport,avatar_url,banner_url,is_public,access_type,channel_id').eq('id', id).maybeSingle(),
    client.from('group_members').select('role').eq('group_id', id).eq('user_id', userId).maybeSingle(),
  ])
  if (group.error || member.error) throw Error('Community settings unavailable')
  if (!group.data || !member.data) return null
  const allowMlb = await canViewMlb(client, userId)
  if (!allowMlb && group.data.sport?.toUpperCase() === 'MLB') return null
  const { data, error } = await client.rpc('get_my_community_permissions', { p_group_id: id })
  if (error) throw Error('Community permissions unavailable')
  const permission = (data ?? {}) as Capabilities
  const role = member.data.role, owner = role === 'owner'
  return { group: group.data, allowMlb, owner,
    channelManagement: owner || role === 'admin' || permission.manage_channels === true,
    roleManagement: owner || role === 'admin' || permission.manage_roles === true,
    memberManagement: owner || permission.manage_members === true,
    invite: owner || role === 'admin' || role === 'moderator' || permission.create_invites === true }
}

export async function nativeCommunitySettings(client: SupabaseClient, access: NonNullable<Awaited<ReturnType<typeof nativeCommunitySettingsAccess>>>) {
  const id = access.group.id
  const [members, channels, roles, assignments] = await Promise.all([
    access.memberManagement || access.roleManagement ? client.from('group_members')
      .select('id:user_id,role,user:users!group_members_user_id_fkey(id,username,display_name,avatar_url,is_verified)').eq('group_id', id).order('created_at').limit(500) : { data: [], error: null },
    access.channelManagement || access.roleManagement ? client.from('channels').select('id,slug,name,description,icon,channel_kind,sort_order')
      .eq('group_id', id).order('sort_order').order('created_at').limit(100) : { data: [], error: null },
    access.roleManagement ? client.from('community_roles').select('id,name,color,is_default,position,permissions')
      .eq('group_id', id).order('position').limit(100) : { data: [], error: null },
    access.roleManagement ? client.from('community_member_roles').select('user_id,role_id').eq('group_id', id).limit(5000) : { data: [], error: null },
  ])
  if ([members, channels, roles, assignments].some(result => result.error)) throw Error('Community settings unavailable')
  const channelIds = (channels.data ?? []).map(channel => channel.id)
  const { data: overrides, error } = access.roleManagement && channelIds.length ? await client.from('community_channel_role_overrides')
    .select('channel_id,role_id,can_view,can_send,can_manage_messages').in('channel_id', channelIds).limit(5000) : { data: [], error: null }
  if (error) throw Error('Channel overrides unavailable')
  return { ...access, members: members.data ?? [], channels: channels.data ?? [], roles: roles.data ?? [], assignments: assignments.data ?? [], overrides: overrides ?? [] }
}

export async function communityContains(client: SupabaseClient, groupId: string, table: 'channels' | 'community_roles', id: unknown) {
  if (typeof id !== 'string' || !isAccountId(id)) return false
  const result = await client.from(table).select('id').eq('id', id).eq('group_id', groupId).maybeSingle()
  if (result.error) throw Error('Community item unavailable')
  return Boolean(result.data)
}
