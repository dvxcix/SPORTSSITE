import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { GroupSettingsForm } from '@/components/groups/GroupSettingsForm'
import Link from 'next/link'
import { ArrowLeft, Settings2 } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'
import { GroupMemberManager, type GroupMemberManagerMember, type GroupRole } from '@/components/groups/GroupMemberManager'
import { GroupChannelManager, type ManagedGroupChannel } from '@/components/groups/GroupChannelManager'

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
  if (member?.role !== 'owner') redirect(`/groups/${slug}`)

  const [{ data: members }, { data: channels }] = await Promise.all([
    supabase.from('group_members')
      .select('user_id,role,user:users(username,display_name,avatar_url,is_verified)')
      .eq('group_id', group.id).order('created_at'),
    supabase.from('channels')
      .select('id,slug,name,description,icon,channel_kind,sort_order')
      .eq('group_id', group.id).order('sort_order').order('created_at'),
  ])
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
      <GroupSettingsForm group={group} />
      <GroupChannelManager groupId={group.id} primaryChannelId={group.channel_id} initialChannels={(channels ?? []) as ManagedGroupChannel[]} />
      <GroupMemberManager groupId={group.id} initialMembers={memberRows} />
    </div>
  )
}
