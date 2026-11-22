import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message } from '@/lib/supabase/types'
import { attachMessageReplies } from './messageReplies'

// Both sender and DM recipient reference users. Always name the sender FK.
export const CHANNEL_MESSAGE_COLUMNS = '*, sender:users!messages_sender_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified,account_type)'

export async function loadChannelHistory(client: SupabaseClient, channelId: string, limit = 80): Promise<Message[]> {
  const { data, error } = await client.from('messages').select(CHANNEL_MESSAGE_COLUMNS)
    .eq('channel_id', channelId).eq('is_deleted', false)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (error) throw new Error('Conversation could not be loaded. Try again.')
  return attachMessageReplies(client, (data ?? []).reverse() as unknown as Message[], { channelId })
}
