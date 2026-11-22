import type { SupabaseClient } from '@supabase/supabase-js'

type Scope = { channelId: string } | { conversationId: string } | { userId: string; partnerId: string }

/** Read reply context through ordinary RLS, constrained to this conversation. */
export async function attachMessageReplies<T extends { reply_to_id?: string | null }>(client: SupabaseClient, rows: T[], scope: Scope): Promise<T[]> {
  const ids = [...new Set(rows.flatMap(row => row.reply_to_id ? [row.reply_to_id] : []))]
  if (!ids.length) return rows
  const group = 'conversationId' in scope
  const table = group ? 'group_messages' : 'messages'
  const senderKey = group ? 'group_messages_sender_id_fkey' : 'messages_sender_id_fkey'
  let request = client.from(table).select(`id,content,sender_id,sender:users!${senderKey}(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color)`).in('id', ids).eq('is_deleted', false)
  if ('channelId' in scope) request = request.eq('channel_id', scope.channelId)
  else if ('conversationId' in scope) request = request.eq('conversation_id', scope.conversationId)
  else request = request.or(`and(sender_id.eq.${scope.userId},dm_recipient_id.eq.${scope.partnerId}),and(sender_id.eq.${scope.partnerId},dm_recipient_id.eq.${scope.userId})`)
  const { data, error } = await request
  if (error) throw new Error('Reply context could not be loaded. Try again.')
  const byId = new Map((data ?? []).map(row => [row.id, row]))
  return rows.map(row => ({ ...row, reply_to: row.reply_to_id ? byId.get(row.reply_to_id) ?? null : null }))
}
