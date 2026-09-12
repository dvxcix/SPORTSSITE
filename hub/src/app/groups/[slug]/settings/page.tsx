import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { GroupSettingsForm } from '@/components/groups/GroupSettingsForm'
import Link from 'next/link'
import { ArrowLeft, Settings2 } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'
import { GroupMemberManager, type GroupMemberManagerMember, type GroupRole } from '@/components/groups/GroupMemberManager'
import { GroupChannelManager, type ManagedGroupChannel } from '@/components/groups/GroupChannelManager'
import { GroupRoleManager, type CommunityChannelOverride, type CommunityRole, type CommunityRoleAssignment } from '@/components/groups/GroupRoleManager'

export const dynamic = 'force-dynamic'

export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/groups/${slug}/settings`)

  const { data: group } = await supabase.from('groups').select('*').eq('slug', slug).single()
  if (!group) notFound()

  const { data: member } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .maybeSingle()
  const isOwner = member?.role === 'owner'
  const { data: capabilities } = member
    ? await supabase.rpc('get_my_community_permissions', { p_group_id: group.id })
    : { data: null }
  const permissions = (capabilities ?? {}) as Record<string, boolean>
  const canManageChannels = isOwner || member?.role === 'admin' || Boolean(permissions.manage_channels)
  const canManageRoles = isOwner || member?.role === 'admin' || Boolean(permissions.manage_roles)
  const canManageMembers = isOwner || Boolean(permissions.manage_members)
  if (!isOwner && !canManageChannels && !canManageRoles && !canManageMembers) redirect(`/groups/${slug}`)

  const [{ data: members }, { data: channels }, { data: roles }, { data: assignments }] = await Promise.all([
    supabase.from('group_members')
      .select('user_id,role,user:users(username,display_name,avatar_url,is_verified)')
      .eq('group_id', group.id).order('created_at'),
    supabase.from('channels')
      .select('id,slug,name,description,icon,channel_kind,sort_order')
      .eq('group_id', group.id).order('sort_order').order('created_at'),
    supabase.from('community_roles').select('*').eq('group_id', group.id).order('position'),
    supabase.from('community_member_roles').select('user_id,role_id').eq('group_id', group.id),
  ])
  const channelIds = (channels ?? []).map(channel => channel.id)
  const { data: overrides } = channelIds.length
    ? await supabase.from('community_channel_role_overrides').select('channel_id,role_id,can_view,can_send,can_manage_messages').in('channel_id', channelIds)
    : { data: [] }
  const memberRows: GroupMemberManagerMember[] = (members ?? []).map(row => ({
    user_id: row.user_id,
    role: row.role as GroupRole,
    user: Array.isArray(row.user) ? row.user[0] ?? null : row.user,
  }))

  return (
    <div className="ss-flow-page">
      <CommunityNav />
      <Link href={`/groups/${slug}`} className="ss-flow-back"><ArrowLeft size={15} /> {group.name}</Link>
      <header className="ss-flow-heading"><span><Settings2 size={19} /></span><div><p>Community controls</p><h1>Group settings</h1></div></header>
      <nav className="ss-settings-jump" aria-label="Community settings sections">{isOwner && <a href="#profile">Overview</a>}{canManageChannels && <a href="#channels">Channels</a>}{canManageRoles && <a href="#roles">Roles</a>}{canManageMembers && <a href="#members">Members</a>}</nav>
      {isOwner && <div id="profile"><GroupSettingsForm group={group} /></div>}
      {canManageChannels && <div id="channels"><GroupChannelManager groupId={group.id} primaryChannelId={group.channel_id} initialChannels={(channels ?? []) as ManagedGroupChannel[]} /></div>}
      {canManageRoles && <GroupRoleManager groupId={group.id} initialRoles={(roles ?? []) as CommunityRole[]} initialAssignments={(assignments ?? []) as CommunityRoleAssignment[]} initialOverrides={(overrides ?? []) as CommunityChannelOverride[]} members={memberRows} channels={(channels ?? []) as ManagedGroupChannel[]} />}
      {canManageMembers && <div id="members"><GroupMemberManager groupId={group.id} initialMembers={memberRows} canChangeSystemRoles={isOwner} /></div>}
    </div>
  )
}
