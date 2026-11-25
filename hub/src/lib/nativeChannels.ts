import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAccountId } from './blocks'
import { loadChannelHistory, type ChannelHistoryCursor } from './channelHistory'
import { isNativeSocialGif, isOwnedNativeMedia } from './nativeMedia'
import { nativeChatReaction } from './nativeChatReaction'
import { canViewMlb } from './mlbViewerAccess'
import { requireTier } from './requireTier'

type Permission = { view?: boolean; send?: boolean; moderate?: boolean }
type Channel = { id: string; name: string; slug: string; group_id: string | null; channel_type: string }
type Room = { channel: Channel; permission: Permission }

async function permissions(client: SupabaseClient, id: string) {
  const result = await client.rpc('get_my_channel_permissions', { p_channel_id: id })
  if (result.error) throw Error('Channel permissions unavailable')
  return (result.data ?? {}) as Permission
}

async function groupVisible(client: SupabaseClient, userId: string, id: string) {
  const { data, error } = await client.from('groups').select('sport').eq('id', id).maybeSingle()
  if (error) throw Error('Community unavailable')
  return Boolean(data && (data.sport?.toUpperCase() !== 'MLB' || await canViewMlb(client, userId)))
}

export async function listNativeChannels(client: SupabaseClient, userId: string, groupId: string | null) {
  if (groupId) {
    if (!isAccountId(groupId) || !await groupVisible(client, userId, groupId)) return { status: 404 as const }
  } else {
    const gate = await requireTier('basic')
    if (gate.error || gate.userId !== userId) return { status: (gate.error?.status ?? 403) as number }
  }
  let query = client.from('channels').select('id,name,description,icon,channel_kind,is_pinned,member_count')
  query = groupId ? query.eq('group_id', groupId).order('sort_order').order('created_at') :
    query.is('group_id', null).eq('channel_type', 'public').order('is_pinned', { ascending: false }).order('member_count', { ascending: false })
  const { data, error } = await query.limit(80)
  if (error) throw Error('Channels unavailable')
  if (!groupId) return { channels: data }
  const [channels, favorites] = await Promise.all([
    Promise.all(data.map(async channel => (await permissions(client, channel.id)).view ? channel : null)),
    client.from('group_channel_preferences').select('channel_id').eq('group_id', groupId).eq('user_id', userId),
  ])
  const preferred = new Set((favorites.data ?? []).map(row => row.channel_id))
  return { channels: channels.filter(item => item !== null).map(channel => ({ ...channel, preferred: preferred.has(channel.id) }))
    .sort((first, second) => Number(second.preferred) - Number(first.preferred)) }
}

export async function openNativeChannel(client: SupabaseClient, userId: string, id: string) {
  const { data: channel, error } = await client.from('channels').select('id,name,slug,group_id,channel_type').eq('id', id).maybeSingle()
  if (error) throw Error('Channel unavailable')
  if (!channel) return { status: 404 as const }
  if (channel.group_id) {
    if (!await groupVisible(client, userId, channel.group_id)) return { status: 404 as const }
  } else {
    if (channel.channel_type !== 'public') return { status: 404 as const }
    const gate = await requireTier('basic')
    if (gate.error || gate.userId !== userId) return { status: (gate.error?.status ?? 403) as number }
  }
  const permission = await permissions(client, id)
  return !channel.group_id || permission.view ? { room: { channel, permission } } : { status: 404 as const }
}

export async function loadNativeChannel(client: SupabaseClient, userId: string, room: Room, before?: ChannelHistoryCursor) {
  const history = await loadChannelHistory(client, room.channel.id, 81, AbortSignal.timeout(12_000), before)
  const hasMore = history.length === 81
  const messages = hasMore ? history.slice(1) : history
  const ids = messages.map(message => message.id)
  const { data: reactions, error } = ids.length
    ? await client.from('reactions').select('target_id,user_id,emoji').eq('target_type', 'message').in('target_id', ids)
    : { data: [], error: null }
  if (error) throw Error('Channel reactions unavailable')
  const first = messages[0]
  return { title: room.channel.name, channelId: room.channel.id, partner: null, members: [], pins: [], owner: false, muted: false,
    canSend: room.permission.send === true, canModerate: room.permission.moderate === true, messages,
    nextCursor: hasMore && first ? `${first.created_at}|${first.id}` : null,
    reactions: (reactions ?? []).map(row => ({ messageId: row.target_id, emoji: row.emoji, mine: row.user_id === userId })) }
}

function inChannel(client: SupabaseClient, channelId: string, messageId: string) {
  return client.from('messages').select('id,sender_id,is_deleted,created_at').eq('channel_id', channelId).is('dm_recipient_id', null).eq('id', messageId)
}

async function recordRead(client: SupabaseClient, userId: string, channelId: string, id: string, at: string) {
  const identity = { user_id: userId, channel_id: channelId, context_type: 'channel' }
  const data = { last_read_at: at, last_read_message_id: id }
  const advance = () => client.from('message_read_positions').update(data).match(identity).lt('last_read_at', at).select('user_id').maybeSingle()
  const existing = await advance()
  if (existing.error) return 503
  if (existing.data) return 200
  const inserted = await client.from('message_read_positions').insert({ ...identity, ...data })
  if (!inserted.error) return 200
  return inserted.error.code === '23505' && !(await advance()).error ? 200 : 503
}

export async function changeNativeChannel(client: SupabaseClient, userId: string, room: Room, input: Record<string, unknown>): Promise<number> {
  const { channel, permission } = room
  const id = typeof input.message === 'string' && isAccountId(input.message) ? input.message : null
  if (!id) return 400
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  const { data: message, error } = await inChannel(client, channel.id, id).maybeSingle()
  if (error) return 503

  if (input.action === 'send') {
    if (message) return message.sender_id === userId ? 200 : 409
    if (!permission.send) return 403
    const image = isOwnedNativeMedia(input.image, userId, 'messages') || isNativeSocialGif(input.image) ? input.image : null
    if (!text && !image || text.length > 1000 || input.image != null && !image) return 400
    let reply: string | null = null
    if (input.reply != null) {
      if (typeof input.reply !== 'string' || !isAccountId(input.reply)) return 400
      const { data, error: lookupError } = await inChannel(client, channel.id, input.reply).eq('is_deleted', false).maybeSingle()
      if (lookupError) return 503
      if (!data) return 404
      reply = data.id
    }
    const inserted = await client.from('messages').insert({ id, sender_id: userId, channel_id: channel.id,
      content: text, reply_to_id: reply, media_urls: image ? [image] : [], message_type: image ? 'media' : 'text' })
    if (!inserted.error) return 200
    if (inserted.error.code === '23505') return (await inChannel(client, channel.id, id).maybeSingle()).data?.sender_id === userId ? 200 : 409
    return inserted.error.code === '42501' ? 403 : 503
  }

  if (!message || message.is_deleted) return input.action === 'delete' && message?.sender_id === userId ? 200 : 404
  if (input.action === 'read') return recordRead(client, userId, channel.id, id, message.created_at)
  if (input.action === 'react' && typeof input.enabled === 'boolean' && typeof input.emoji === 'string') {
    const selection = await nativeChatReaction(client, input.emoji, input.enabled)
    if (selection.status) return selection.status
    const identity = { target_type: 'message', target_id: id, user_id: userId, emoji: selection.emoji }
    const result = await (input.enabled ? client.from('reactions').insert(identity) : client.from('reactions').delete().match(identity))
    return !result.error || result.error.code === '23505' ? 200 : 503
  }
  if (input.action === 'delete' && message.sender_id !== userId) {
    if (!permission.moderate) return 403
    return (await client.rpc('moderate_channel_message', { p_message_id: id })).error ? 403 : 200
  }
  if (input.action !== 'edit' && input.action !== 'delete') return 400
  if (message.sender_id !== userId) return 403
  if (input.action === 'edit' && !permission.send) return 403
  if (input.action === 'edit' && (!text || text.length > 1000)) return 400
  const values = input.action === 'edit' ? { content: text } : { content: '', is_deleted: true, media_urls: [] }
  const result = await client.from('messages').update({ ...values, edited_at: new Date().toISOString() })
    .eq('id', id).eq('sender_id', userId).eq('channel_id', channel.id).eq('is_deleted', false).select('id').maybeSingle()
  return result.error ? 503 : result.data ? 200 : 409
}
