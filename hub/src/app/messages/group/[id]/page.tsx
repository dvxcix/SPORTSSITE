import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GroupDMRoom, type GroupConversationMember, type GroupMessage, type GroupMessageReaction } from '@/components/chat/GroupDMRoom'
import { attachMessageReplies } from '@/lib/messageReplies'

export const dynamic = 'force-dynamic'

export default async function GroupMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages')

  const [conversationResult, membersResult, historyResult] = await Promise.all([
    supabase.from('group_conversations').select('id,name,owner_id,avatar_url,created_at,updated_at').eq('id', id).maybeSingle(),
    supabase.from('group_conversation_members').select('user_id,role,muted,last_read_at,joined_at,user:users!group_conversation_members_user_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified)').eq('conversation_id', id).order('joined_at'),
    supabase.from('group_messages').select('id,conversation_id,sender_id,content,media_urls,reply_to_id,edited_at,is_deleted,created_at,sender:users!group_messages_sender_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified)').eq('conversation_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200),
  ])
  if ([conversationResult, membersResult, historyResult].some(result => result.error)) throw new Error('Group conversation could not be loaded. Try again.')
  const conversation = conversationResult.data, members = membersResult.data, history = historyResult.data?.reverse()
  if (!conversation) redirect('/messages')
  const messages = await attachMessageReplies(supabase, (history ?? []) as unknown as GroupMessage[], { conversationId: id })
  const messageIds = (history ?? []).map(message => message.id)
  const { data: reactions } = messageIds.length
    ? await supabase.from('group_message_reactions').select('message_id,user_id,emoji,created_at').in('message_id', messageIds)
    : { data: [] }

  return <GroupDMRoom conversation={conversation} members={(members ?? []) as unknown as GroupConversationMember[]} initialMessages={messages} initialReactions={(reactions ?? []) as GroupMessageReaction[]} currentUserId={user.id}/>
}
