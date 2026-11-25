import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getBlockedEitherWayIds } from '@/lib/blocks'

export async function loadMessageInbox(supabase: SupabaseClient, userId: string) {
  const [blockedIdList, readPositionsResult, threadsResult, preferencesResult, followsResult] = await Promise.all([
    getBlockedEitherWayIds(supabase, userId),
    supabase.from('message_read_positions').select('partner_id,last_read_at').eq('user_id', userId).eq('context_type', 'dm'),
    supabase
      .from('messages')
      .select(`
        id, content, is_deleted, created_at, sender_id, dm_recipient_id,
        sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color),
        recipient:users!messages_dm_recipient_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color)
      `)
      .or(`sender_id.eq.${userId},dm_recipient_id.eq.${userId}`)
      .not('dm_recipient_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(250),
    supabase.from('dm_conversation_preferences').select('partner_id,status,muted').eq('user_id', userId),
    supabase.from('follows').select('following_id').eq('follower_id', userId),
  ])
  if ([readPositionsResult, threadsResult, preferencesResult, followsResult].some(result => result.error)) throw new Error('Your inbox could not be loaded. Try again.')
  const blockedIds = new Set(blockedIdList)
  const readAtByPartner = new Map((readPositionsResult.data ?? []).map(row => [row.partner_id, new Date(row.last_read_at).getTime()]))
  const unreadByPartner = new Map<string, number>()
  for (const message of threadsResult.data ?? []) {
    if (message.dm_recipient_id !== userId || message.sender_id === userId) continue
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
  const outgoingPartnerIds = new Set((threadsResult.data ?? []).filter(message => message.sender_id === userId).map(message => message.dm_recipient_id))
  for (const m of threadsResult.data ?? []) {
    const partner = (m.sender as any)?.id === userId ? m.recipient : m.sender
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
      content: conversation.is_deleted ? 'Message deleted' : conversation.content ?? '',
      createdAt: conversation.created_at,
      unreadCount: unreadByPartner.get(partner.id) ?? 0,
      lastIsMine: conversation.sender_id === userId,
      isRequest: conversation.preference?.status !== 'accepted'
        && conversation.sender_id !== userId
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

  const { data: groupMemberships, error: groupMembershipError } = await supabase.from('group_conversation_members').select('conversation_id,last_read_at').eq('user_id', userId)
  if (groupMembershipError) throw new Error('Group conversations could not be loaded. Try again.')
  const groupIds = (groupMemberships ?? []).map(membership => membership.conversation_id)
  let groupConversations: Array<{
    id: string; name: string; updatedAt: string; lastMessage: string; unreadCount: number
    members: Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null; avatarRingStyle: import('@/lib/avatarStyles').MemberRingStyle | null; avatarRingColor: string | null }>
  }> = []
  if (groupIds.length) {
    const [groupsResult, groupMessagesResult, groupMembersResult] = await Promise.all([
      supabase.from('group_conversations').select('id,name,updated_at').in('id', groupIds).order('updated_at', { ascending: false }),
      supabase.from('group_messages').select('id,conversation_id,sender_id,content,created_at,is_deleted').in('conversation_id', groupIds).order('created_at', { ascending: false }).limit(500),
      supabase.from('group_conversation_members').select('conversation_id,user:users!group_conversation_members_user_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color)').in('conversation_id', groupIds),
    ])
    if ([groupsResult, groupMessagesResult, groupMembersResult].some(result => result.error)) throw new Error('Group conversations could not be loaded. Try again.')
    const groups = groupsResult.data, groupMessages = groupMessagesResult.data, groupMembers = groupMembersResult.data
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
        unreadCount: messages.filter(message => message.sender_id !== userId && new Date(message.created_at).getTime() > readAt).length,
        members: participants.map(member => ({ id: member.id, username: member.username, displayName: member.display_name ?? null, avatarUrl: member.avatar_url ?? null, avatarRingStyle: member.avatar_ring_style ?? null, avatarRingColor: member.avatar_ring_color ?? null })),
      }
    })
  }

  return { conversations, groupConversations }
}
