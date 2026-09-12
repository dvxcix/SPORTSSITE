import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MessageCircle, Plus, ShieldCheck } from 'lucide-react'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { MessageInbox } from '@/components/social/MessageInbox'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'
import { GroupConversationInbox } from '@/components/chat/GroupConversationInbox'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages')

  const [blockedIdList, readPositionsResult, threadsResult, preferencesResult, followsResult] = await Promise.all([
    getBlockedEitherWayIds(supabase, user.id),
    supabase.from('message_read_positions').select('partner_id,last_read_at').eq('user_id', user.id).eq('context_type', 'dm'),
    supabase
      .from('messages')
      .select(`
        id, content, created_at, sender_id, dm_recipient_id,
        sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color),
        recipient:users!messages_dm_recipient_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color)
      `)
      .or(`sender_id.eq.${user.id},dm_recipient_id.eq.${user.id}`)
      .not('dm_recipient_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(250),
    supabase.from('dm_conversation_preferences').select('partner_id,status,muted').eq('user_id', user.id),
    supabase.from('follows').select('following_id').eq('follower_id', user.id),
  ])
  const blockedIds = new Set(blockedIdList)
  const readAtByPartner = new Map((readPositionsResult.data ?? []).map(row => [row.partner_id, new Date(row.last_read_at).getTime()]))
  const unreadByPartner = new Map<string, number>()
  for (const message of threadsResult.data ?? []) {
    if (message.dm_recipient_id !== user.id || message.sender_id === user.id) continue
    const readAt = readAtByPartner.get(message.sender_id) ?? 0
    if (new Date(message.created_at).getTime() > readAt) {
      unreadByPartner.set(message.sender_id, (unreadByPartner.get(message.sender_id) ?? 0) + 1)
    }
  }

  // Deduplicate by conversation partner
  const seen = new Set<string>()
  const convos: any[] = []
  const preferenceByPartner = new Map((preferencesResult.data ?? []).map(row => [row.partner_id, row]))
  const followingIds = new Set((followsResult.data ?? []).map(row => row.following_id))
  const outgoingPartnerIds = new Set((threadsResult.data ?? []).filter(message => message.sender_id === user.id).map(message => message.dm_recipient_id))
  for (const m of threadsResult.data ?? []) {
    const partner = (m.sender as any)?.id === user.id ? m.recipient : m.sender
    const pid = (partner as any)?.id
    if (pid && !seen.has(pid) && !blockedIds.has(pid)) {
      seen.add(pid)
      const preference = preferenceByPartner.get(pid)
      if (preference?.status !== 'declined') convos.push({ ...m, partner, preference })
    }
  }

  const conversations = convos.map(conversation => {
    const partner = conversation.partner as any
    return {
      id: partner.id,
      content: conversation.content ?? '',
      createdAt: conversation.created_at,
      unreadCount: unreadByPartner.get(partner.id) ?? 0,
      lastIsMine: conversation.sender_id === user.id,
      isRequest: conversation.preference?.status !== 'accepted'
        && conversation.sender_id !== user.id
        && !followingIds.has(partner.id)
        && !outgoingPartnerIds.has(partner.id),
      partner: {
        id: partner.id,
        username: partner.username,
        displayName: partner.display_name ?? null,
        avatarUrl: partner.avatar_url ?? null,
        avatarRingStyle: partner.avatar_ring_style ?? null,
        avatarRingColor: partner.avatar_ring_color ?? null,
      },
    }
  })

  const { data: groupMemberships } = await supabase.from('group_conversation_members').select('conversation_id,last_read_at').eq('user_id', user.id)
  const groupIds = (groupMemberships ?? []).map(membership => membership.conversation_id)
  let groupConversations: Array<{
    id: string; name: string; updatedAt: string; lastMessage: string; unreadCount: number
    members: Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null; avatarRingStyle: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit' | null; avatarRingColor: string | null }>
  }> = []
  if (groupIds.length) {
    const [{ data: groups }, { data: groupMessages }, { data: groupMembers }] = await Promise.all([
      supabase.from('group_conversations').select('id,name,updated_at').in('id', groupIds).order('updated_at', { ascending: false }),
      supabase.from('group_messages').select('id,conversation_id,sender_id,content,created_at,is_deleted').in('conversation_id', groupIds).order('created_at', { ascending: false }).limit(500),
      supabase.from('group_conversation_members').select('conversation_id,user:users!group_conversation_members_user_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color)').in('conversation_id', groupIds),
    ])
    const readByGroup = new Map((groupMemberships ?? []).map(membership => [membership.conversation_id, membership.last_read_at ? new Date(membership.last_read_at).getTime() : 0]))
    groupConversations = (groups ?? []).map(group => {
      const messages = (groupMessages ?? []).filter(message => message.conversation_id === group.id)
      const participants = (groupMembers ?? [])
        .filter(member => member.conversation_id === group.id)
        .flatMap(member => Array.isArray(member.user) ? member.user : member.user ? [member.user] : [])
      const readAt = readByGroup.get(group.id) ?? 0
      return {
        id: group.id,
        name: group.name,
        updatedAt: group.updated_at,
        lastMessage: messages[0]?.is_deleted ? 'Message deleted' : messages[0]?.content ?? '',
        unreadCount: messages.filter(message => message.sender_id !== user.id && new Date(message.created_at).getTime() > readAt).length,
        members: participants.map(member => ({ id: member.id, username: member.username, displayName: member.display_name ?? null, avatarUrl: member.avatar_url ?? null, avatarRingStyle: member.avatar_ring_style ?? null, avatarRingColor: member.avatar_ring_color ?? null })),
      }
    })
  }

  return (
    <ProductPageShell narrow className="ss-messages-page">
      <CommunityNav />
      <ProductHero icon={<MessageCircle size={21}/>} eyebrow="Member network" title="Messages" description="Private conversations with people across SlipSurge." actions={<ProductAction href="/messages/new"><Plus size={15}/> New message</ProductAction>}/>

      {groupConversations.length > 0 && <><ProductSectionHeader title="Group conversations" meta={`${groupConversations.length} group${groupConversations.length === 1 ? '' : 's'}`}/><ProductPanel className="ss-messages-inbox-shell"><GroupConversationInbox conversations={groupConversations}/></ProductPanel></>}

      <ProductSectionHeader title="Inbox" meta={`${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}/>
      <ProductPanel className="ss-messages-inbox-shell">
        <div className="ss-messages-section-heading"><span><ShieldCheck size={12} /> Private</span></div>
        <MessageInbox conversations={conversations} currentUserId={user.id} />
      </ProductPanel>
    </ProductPageShell>
  )
}
