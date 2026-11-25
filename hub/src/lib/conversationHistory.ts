import type { SupabaseClient } from '@supabase/supabase-js'
import type { DMMessage } from '@/components/chat/DMRoom'
import type { GroupMessage } from '@/components/chat/GroupDMRoom'
import { attachMessageReplies } from './messageReplies'
import type { ChannelHistoryCursor } from './channelHistory'

export const DM_MESSAGE_COLUMNS = 'id,content,created_at,edited_at,is_deleted,sender_id,reply_to_id,forwarded_from_id,media_urls,reaction_count,sender:users!messages_sender_id_fkey(username,display_name,avatar_url,avatar_ring_style,avatar_ring_color)'
export const GROUP_MESSAGE_COLUMNS = 'id,conversation_id,sender_id,content,media_urls,reply_to_id,edited_at,is_deleted,created_at,sender:users!group_messages_sender_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified)'

/** Ordinary authenticated reads retain the same pair/conversation scope as initial navigation. */
type HistoryPage = { limit: number; before?: ChannelHistoryCursor }

export async function loadDmHistory(client: SupabaseClient, userId: string, partnerId: string, signal: AbortSignal,
  page?: HistoryPage): Promise<DMMessage[]> {
  let request = client.from('messages').select(DM_MESSAGE_COLUMNS)
    .or(`and(sender_id.eq.${userId},dm_recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},dm_recipient_id.eq.${userId})`)
    .not('dm_recipient_id', 'is', null).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(page?.limit ?? 100)
  if (page?.before) {
    const { at, id } = page.before
    request = request.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`)
  }
  const { data, error } = await request.abortSignal(signal)
  if (error) throw new Error('Conversation could not be refreshed.')
  return attachMessageReplies(client, [...(data ?? [])].reverse() as unknown as DMMessage[], { userId, partnerId }, signal)
}

export async function loadGroupHistory(client: SupabaseClient, conversationId: string, signal: AbortSignal,
  page?: HistoryPage): Promise<GroupMessage[]> {
  let request = client.from('group_messages').select(GROUP_MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(page?.limit ?? 200)
  if (page?.before) {
    const { at, id } = page.before
    request = request.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`)
  }
  const { data, error } = await request.abortSignal(signal)
  if (error) throw new Error('Conversation could not be refreshed.')
  return attachMessageReplies(client, [...(data ?? [])].reverse() as unknown as GroupMessage[], { conversationId }, signal)
}

type HistoryRow = { id: string; created_at: string }
/** Keep changes received while a read was in flight, including removals. */
export function reconcileMessageHistory<T extends HistoryRow>(before: T[], current: T[], remote: T[]): T[] {
  const original = new Map(before.map(row => [row.id, row]))
  const present = new Set(current.map(row => row.id))
  const merged = new Map(remote.map(row => [row.id, row]))
  for (const row of current) if (!original.has(row.id) || original.get(row.id) !== row) merged.set(row.id, row)
  for (const id of original.keys()) if (!present.has(id)) merged.delete(id)
  return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}
