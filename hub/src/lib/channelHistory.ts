import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message } from '@/lib/supabase/types'
import { attachMessageReplies } from './messageReplies'

// Both sender and DM recipient reference users. Always name the sender FK.
export const CHANNEL_MESSAGE_COLUMNS = '*, sender:users!messages_sender_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified,account_type)'

export type ChannelHistoryCursor = { at: string; id: string }

export function readChannelHistoryCursor(value: string): ChannelHistoryCursor | null {
  const [at, id, extra] = value.split('|')
  if (extra !== undefined || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(at) ||
      !Number.isFinite(Date.parse(at)) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? '')) return null
  return { at, id }
}

export async function loadChannelHistory(client: SupabaseClient, channelId: string, limit = 80, signal?: AbortSignal,
  before?: ChannelHistoryCursor): Promise<Message[]> {
  let request = client.from('messages').select(CHANNEL_MESSAGE_COLUMNS)
    .eq('channel_id', channelId).eq('is_deleted', false)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (before) request = request.or(`created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`)
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw new Error('Conversation could not be loaded. Try again.')
  return attachMessageReplies(client, (data ?? []).reverse() as unknown as Message[], { channelId }, signal)
}
